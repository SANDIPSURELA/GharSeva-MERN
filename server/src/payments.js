import express from "express";
import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { Booking, Payment, PaymentRefund, PaymentEvent } from "./models.js";
import { auth, role } from "./auth.js";
import { fail, text } from "./domain.js";
import {
  paymentOptions,
  razorpayGateway,
  validSignature,
  checkoutSignature,
  verifyWebhookSignature,
} from "./payment-gateway.js";
import {
  NEW_PLAN,
  CAPTURED,
  financialState,
  currentBill,
  paymentSummary,
  paise,
  rupeesToPaise,
} from "./billing-domain.js";
import {
  mountBilling,
  updateFinance,
  markSettlement,
  audit,
} from "./billing.js";
import { requirePaymentIndexes } from "./payment-indexes.js";
const allowed = ["ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"];
const oid = (v) => {
  if (!mongoose.isValidObjectId(v)) fail(404, "Payment or booking not found.");
  return v;
};
const scope = (u) =>
  u.role === "admin"
    ? {}
    : u.role === "provider"
      ? { provider: u._id }
      : { customer: u._id };
const purposeOf = (p) => p.purpose || "VISIT_DEPOSIT";
function currentMode(p) {
  const o = paymentOptions();
  if (!o.enabled || o.mode !== p.mode)
    fail(
      409,
      "Restore the original payment mode and credentials before reconciling or collecting. No simulation fallback is available.",
    );
  return o;
}
export async function bookingFor(id, user) {
  const b = await Booking.findOne({ _id: oid(id), ...scope(user) })
    .populate("customer", "name")
    .populate("provider", "name status profile.status")
    .lean();
  if (!b) fail(404, "Booking not found.");
  return b;
}
export function paymentView(p, b) {
  if (!p) return null;
  const x = p.toObject ? p.toObject() : p;
  return {
    ...x,
    booking: b?._id || x.booking,
    bookingInfo: b
      ? {
          service: b.service,
          date: b.date,
          time: b.time,
          status: b.status,
          customer: b.customer?.name,
          provider: b.provider?.name,
        }
      : null,
    refundReviewNeeded:
      !!b &&
      ["CANCELLED", "REJECTED"].includes(b.status) &&
      CAPTURED.includes(x.status) &&
      (x.refundedAmount || 0) < (x.capturedAmount ?? x.amount),
  };
}
export async function paymentContext(id, user) {
  const b = await bookingFor(id, user),
    payments = await Payment.find({ booking: b._id })
      .sort({ createdAt: 1 })
      .lean(),
    refunds = await PaymentRefund.find({ booking: b._id })
      .sort({ createdAt: 1 })
      .lean();
  const summary = paymentSummary(b, payments, refunds),
    bill = currentBill(b),
    options = paymentOptions();
  return {
    booking: {
      _id: b._id,
      service: b.service,
      date: b.date,
      time: b.time,
      status: b.status,
      price: b.price,
      customer: b.customer?.name,
      provider: b.provider?.name,
      paymentPlan: b.paymentPlan,
      billing: b.billing,
    },
    payment: paymentView(
      payments.find((p) => purposeOf(p) === "VISIT_DEPOSIT"),
      b,
    ),
    payments: payments.map((p) => paymentView(p, b)),
    refunds,
    bill,
    extras: financialState(b).extras,
    summary,
    options,
    canPay: user.role === "customer" && allowed.includes(b.status),
    canBalance:
      user.role === "customer" &&
      b.status === "COMPLETED" &&
      bill?.status === "APPROVED" &&
      !summary.settled &&
      !summary.refundReview &&
      !summary.issue &&
      summary.remaining > 0,
  };
}
export function verifyOrder(order, p) {
  if (
    !order ||
    !/^order_[a-zA-Z0-9]{5,80}$/.test(order.id || "") ||
    (p.orderId && p.orderId !== order.id) ||
    order.amount !== p.amount ||
    order.currency !== "INR" ||
    order.receipt !== p.receipt
  )
    fail(
      409,
      "Gateway order does not match the stored payment. Administrator reconciliation is required.",
    );
}
function validateSnapshot(s, p) {
  if (
    !s ||
    s.order_id !== p.orderId ||
    s.amount !== p.amount ||
    s.currency !== "INR" ||
    !/^pay_[a-zA-Z0-9]{5,80}$/.test(s.id || "") ||
    !["created", "authorized", "captured", "refunded", "failed"].includes(
      s.status,
    )
  )
    fail(409, "Gateway payment reference, order, amount or currency mismatch.");
  if (
    !Number.isInteger(s.amount_refunded || 0) ||
    (s.amount_refunded || 0) < 0 ||
    (s.amount_refunded || 0) > s.amount
  )
    fail(409, "Invalid gateway refund amount.");
  if (["captured", "refunded"].includes(s.status) && s.captured !== true)
    fail(409, "Gateway capture status is inconsistent.");
}
async function saveRefund(p, r, postSettlement) {
  if (
    !r ||
    !/^rfnd_[a-zA-Z0-9]{5,80}$/.test(r.id || "") ||
    r.payment_id == null ||
    r.currency !== "INR" ||
    !["pending", "processed", "failed"].includes(r.status)
  )
    fail(409, "Invalid authoritative refund record.");
  paise(r.amount, "Refund amount", 1);
  if (r.amount > p.amount) fail(409, "Refund exceeds the captured payment.");
  let prior = await PaymentRefund.findOne({ gatewayRefundId: r.id });
  if (!prior) {
    try {
      return await PaymentRefund.create({
        payment: p._id,
        booking: p.booking,
        customer: p.customer,
        provider: p.provider,
        mode: p.mode,
        gatewayRefundId: r.id,
        amount: r.amount,
        status: r.status.toUpperCase(),
        postSettlement,
        history: [
          {
            action: r.status.toUpperCase(),
            note: "Authoritative Razorpay test refund record.",
          },
        ],
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      prior = await PaymentRefund.findOne({ gatewayRefundId: r.id });
    }
  }
  if (String(prior.payment) !== String(p._id) || prior.amount !== r.amount)
    fail(409, "Refund reference belongs to a different payment/amount.");
  if (
    prior.status === "PROCESSED" ||
    prior.status === r.status.toUpperCase() ||
    (prior.status === "FAILED" && r.status === "pending")
  )
    return prior;
  return (
    (await PaymentRefund.findOneAndUpdate(
      { _id: prior._id, revision: prior.revision },
      {
        $set: { status: r.status.toUpperCase() },
        $inc: { revision: 1 },
        $push: {
          history: {
            action: r.status.toUpperCase(),
            note: "Refund status reconciled; requested is not processed.",
          },
        },
      },
      { returnDocument: "after" },
    )) || (await PaymentRefund.findById(prior._id))
  );
}
async function syncDemoRefunds(record) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await Payment.findById(record._id);
    const refunds = await PaymentRefund.find({
      payment: current._id,
      status: "PROCESSED",
    }).lean();
    const total = Math.max(
      current.refundedAmount || 0,
      refunds.reduce((n, r) => n + r.amount, 0),
    );
    if (total > (current.capturedAmount ?? current.amount))
      fail(409, "Refund total exceeds capture. Administrator review required.");
    if (total === (current.refundedAmount || 0)) return current;
    const status =
      total === (current.capturedAmount ?? current.amount)
        ? "REFUNDED"
        : "PARTIALLY_REFUNDED";
    const saved = await Payment.findOneAndUpdate(
      { _id: current._id, revision: current.revision },
      {
        $set: { refundedAmount: total, status },
        $inc: { revision: 1 },
        $push: {
          history: {
            action: status,
            source: "DEMO",
            note: "Simulation only. No real money returned.",
          },
        },
      },
      { returnDocument: "after" },
    );
    if (saved) return saved;
  }
  fail(409, "Refund reconciliation changed concurrently. Refresh again.");
}
export async function reconcilePayment(
  record,
  gateway = razorpayGateway(),
  source = "STATUS_REFRESH",
  callback,
) {
  currentMode(record);
  if (record.mode === "demo") return syncDemoRefunds(record);
  let p = record;
  if (!p.orderId) {
    const order = await gateway.findOrder(p.receipt);
    if (!order) return p;
    verifyOrder(order, p);
    p =
      (await Payment.findOneAndUpdate(
        { _id: p._id, orderId: { $exists: false } },
        {
          $set: { orderId: order.id, status: "READY", lastError: "" },
          $inc: { revision: 1 },
        },
        { returnDocument: "after" },
      )) || (await Payment.findById(p._id));
  }
  const order = await gateway.fetchOrder(p.orderId);
  verifyOrder(order, p);
  const snapshots = await gateway.orderPayments(p.orderId);
  if (!Array.isArray(snapshots))
    fail(503, "Unreadable gateway attempt history.");
  const byId = new Map();
  for (const s of snapshots) {
    validateSnapshot(s, p);
    byId.set(s.id, s);
  }
  if (callback) {
    validateSnapshot(callback, p);
    byId.set(callback.id, callback);
  }
  if (p.paymentId && !byId.has(p.paymentId)) {
    const known = await gateway.fetchPayment(p.paymentId);
    validateSnapshot(known, p);
    byId.set(known.id, known);
  }
  const captured = [...byId.values()].filter(
    (s) => s.captured === true && ["captured", "refunded"].includes(s.status),
  );
  const captureIds = [
    ...new Set([
      ...(p.captureIds || []),
      ...(CAPTURED.includes(p.status) && p.paymentId ? [p.paymentId] : []),
      ...captured.map((s) => s.id),
    ]),
  ];
  let issue = "",
    refundPending = false;
  if (captured.length && order.status !== "paid")
    issue =
      "Captured payment/order state mismatch; administrator review required.";
  if (!captured.length && order.status === "paid")
    issue =
      "Paid order has no confirmed captured payment; reconcile before continuing.";
  if (captureIds.length > 1)
    issue =
      "Multiple captures detected for one order. Collection is blocked for refund review.";
  const b = await Booking.findById(p.booking);
  for (const s of captured) {
    const refunds = await gateway.paymentRefunds(s.id);
    if (!Array.isArray(refunds)) fail(503, "Unreadable refund history.");
    const seen = new Set();
    for (const r of refunds) {
      if (r.payment_id !== s.id || seen.has(r.id))
        fail(409, "Refund does not match the captured transaction.");
      seen.add(r.id);
      await saveRefund(p, r, !!b?.billing?.settledAt);
    }
    const processed = refunds
        .filter((r) => r.status === "processed")
        .reduce((n, r) => n + r.amount, 0),
      pending = refunds
        .filter((r) => r.status === "pending")
        .reduce((n, r) => n + r.amount, 0);
    if (processed + pending > s.amount)
      fail(409, "Gateway refunds exceed the captured amount.");
    refundPending ||= pending > 0;
    if (processed !== (s.amount_refunded || 0) && !pending)
      issue =
        "Refund totals need authoritative reconciliation; collection is blocked.";
  }
  const refundRows = await PaymentRefund.find({
      payment: p._id,
      status: "PROCESSED",
    }).lean(),
    processed = refundRows.reduce((n, r) => n + r.amount, 0);
  let current = p;
  for (let attempt = 0; attempt < 5; attempt++) {
    const effectiveIds = [
      ...new Set([...(current.captureIds || []), ...captureIds]),
    ];
    if (effectiveIds.length > 1)
      issue =
        "Multiple captures detected for one order. Collection is blocked for refund review.";
    const gross = Math.max(
        current.capturedAmount ??
          (CAPTURED.includes(current.status) ? current.amount : 0),
        effectiveIds.length * p.amount,
      ),
      refunded = Math.max(current.refundedAmount || 0, processed);
    if (refunded > gross)
      fail(409, "Processed refunds exceed recorded captures.");
    const status = gross
      ? refunded === gross
        ? "REFUNDED"
        : refunded
          ? "PARTIALLY_REFUNDED"
          : "CAPTURED"
      : [...byId.values()].some((s) => s.status === "authorized")
        ? "AUTHORIZED"
        : [...byId.values()].some((s) => s.status === "failed")
          ? "FAILED"
          : "READY";
    const first =
        captured.find((s) => s.id === current.paymentId) || captured[0],
      changes = {
        status,
        capturedAmount: gross,
        captureIds: effectiveIds,
        refundedAmount: refunded,
        refundPending,
        reconciliationIssue: issue,
        lastError:
          issue ||
          (status === "FAILED"
            ? "Attempt failed. Refresh before retrying the same order."
            : ""),
      };
    if (first) {
      changes.paymentId = first.id;
      changes.method = ["upi", "card", "netbanking", "wallet", "emi"].includes(
        first.method,
      )
        ? first.method
        : undefined;
    }
    if (
      Object.entries(changes).every(
        ([k, v]) => JSON.stringify(current[k]) === JSON.stringify(v),
      )
    )
      return current;
    const saved = await Payment.findOneAndUpdate(
      { _id: current._id, revision: current.revision },
      {
        $set: changes,
        $inc: { revision: 1 },
        $push: {
          history: {
            action: status,
            source,
            note:
              issue || "Authoritative gateway/order/refund status reconciled.",
          },
        },
      },
      { returnDocument: "after" },
    );
    if (saved) {
      if (b) await markSettlement(await Booking.findById(p.booking));
      return saved;
    }
    current = await Payment.findById(p._id);
  }
  fail(409, "Payment changed during reconciliation. Refresh again.");
}
async function refreshCredits(b, gateway) {
  for (const p of await Payment.find({ booking: b._id }))
    await reconcilePayment(p, gateway);
  const latest = await Booking.findById(b._id),
    f = financialState(latest);
  let changed = false;
  for (const entry of f.demoRefunds || [])
    if (
      entry.status === "RESERVED" &&
      (await PaymentRefund.exists({
        gatewayRefundId: entry.id,
        status: "PROCESSED",
      }))
    ) {
      entry.status = "DONE";
      changed = true;
    }
  if (changed) await updateFinance(latest, f);
}
export async function requireDepositBeforeStart(
  b,
  { gateway = razorpayGateway() } = {},
) {
  if (b.paymentPlan?.type !== NEW_PLAN) return;
  const p = await Payment.findOne({ booking: b._id, purpose: "VISIT_DEPOSIT" });
  if (!p)
    fail(
      409,
      "A captured deposit is required before the visit OTP can start work.",
    );
  await reconcilePayment(p, gateway);
  const payments = await Payment.find({ booking: b._id }).lean(),
    refunds = await PaymentRefund.find({ booking: b._id }).lean(),
    summary = paymentSummary(b, payments, refunds);
  if (!summary.depositPaid || summary.pendingRefund || summary.issue)
    fail(
      409,
      "Deposit capture/refund reconciliation must finish before starting work. The visit OTP is still required.",
    );
}
export function mountPaymentWebhook(app, { gateway = razorpayGateway() } = {}) {
  const limit = rateLimit({
    windowMs: 60000,
    limit: 120,
    message: { message: "Webhook rate limit reached." },
  });
  app.post(
    "/api/payments/webhook",
    limit,
    express.raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      const options = paymentOptions();
      if (options.mode !== "razorpay_test" || !options.enabled)
        fail(503, "Razorpay test webhooks are not configured.");
      if (!verifyWebhookSignature(req.body, req.get("X-Razorpay-Signature")))
        fail(401, "Invalid webhook signature.");
      let event;
      try {
        event = JSON.parse(req.body.toString("utf8"));
      } catch {
        fail(400, "Invalid webhook JSON.");
      }
      if (
        ![
          "payment.captured",
          "payment.authorized",
          "payment.failed",
          "order.paid",
          "refund.processed",
          "refund.created",
          "refund.failed",
        ].includes(event.event)
      )
        return res.json({ ok: true, ignored: true });
      const bodyHash = createHash("sha256").update(req.body).digest("hex"),
        header = req.get("X-Razorpay-Event-Id"),
        eventKey =
          "razorpay_test:" + (header ? String(header).slice(0, 120) : bodyHash);
      let log;
      try {
        log = await PaymentEvent.create({
          eventKey,
          bodyHash,
          event: event.event,
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        log = await PaymentEvent.findOne({ eventKey });
        if (log.bodyHash !== bodyHash)
          fail(409, "Webhook ID reused with a different payload.");
        if (log.processedAt) return res.json({ ok: true, duplicate: true });
      }
      let p;
      const paymentId =
        event.payload?.payment?.entity?.id ||
        event.payload?.refund?.entity?.payment_id;
      if (event.event === "order.paid") {
        const orderId = event.payload?.order?.entity?.id;
        if (!/^order_[a-zA-Z0-9]{5,80}$/.test(orderId || ""))
          fail(400, "Missing gateway order reference.");
        p = await Payment.findOne({ orderId, mode: "razorpay_test" });
      } else {
        if (!/^pay_[a-zA-Z0-9]{5,80}$/.test(paymentId || ""))
          fail(400, "Missing gateway payment reference.");
        const s = await gateway.fetchPayment(paymentId);
        p = await Payment.findOne({
          orderId: s.order_id,
          mode: "razorpay_test",
        });
        if (p) validateSnapshot(s, p);
      }
      if (p) {
        await reconcilePayment(p, gateway, "WEBHOOK");
        await markSettlement(await Booking.findById(p.booking));
      }
      await PaymentEvent.updateOne(
        { _id: log._id },
        { $set: { payment: p?._id, processedAt: new Date() } },
      );
      res.json({ ok: true, ...(!p ? { ignored: true } : {}) });
    },
  );
}
export function mountPayments(app, { gateway = razorpayGateway() } = {}) {
  const limit = rateLimit({
    windowMs: 900000,
    limit: 60,
    message: { message: "Too many payment requests. Please wait." },
  });
  app.get("/api/payments/journeys", auth, async (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1)),
      filter = scope(req.user);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .lean(),
      Booking.countDocuments(filter),
    ]);
    const ids = bookings.map((b) => b._id),
      [payments, refunds] = await Promise.all([
        Payment.find({ booking: { $in: ids } }).lean(),
        PaymentRefund.find({ booking: { $in: ids } }).lean(),
      ]);
    res.json({
      items: bookings.map((b) => ({
        _id: b._id,
        service: b.service,
        date: b.date,
        status: b.status,
        paymentPlan: b.paymentPlan,
        summary: paymentSummary(
          b,
          payments.filter((p) => String(p.booking) === String(b._id)),
          refunds.filter((r) => String(r.booking) === String(b._id)),
        ),
      })),
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
      total,
    });
  });
  app.get("/api/payments/options", (req, res) => res.json(paymentOptions()));
  app.get("/api/payments/booking/:id", auth, async (req, res) =>
    res.json(await paymentContext(req.params.id, req.user)),
  );
  app.get("/api/payments", auth, async (req, res) => {
    const filter = scope(req.user);
    if (req.query.mode) {
      if (!["demo", "razorpay_test"].includes(req.query.mode))
        fail(400, "Choose a valid mode.");
      filter.mode = req.query.mode;
    }
    const page = Math.max(
        1,
        Math.min(10000, Math.floor(Number(req.query.page) || 1)),
      ),
      [rows, total] = await Promise.all([
        Payment.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * 20)
          .limit(20)
          .lean(),
        Payment.countDocuments(filter),
      ]),
      bookings = await Booking.find({
        _id: { $in: rows.map((p) => p.booking) },
      })
        .populate("provider customer", "name")
        .lean();
    res.json({
      items: rows.map((p) =>
        paymentView(
          p,
          bookings.find((b) => String(b._id) === String(p.booking)),
        ),
      ),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
      options: paymentOptions(),
    });
  });
  app.post(
    "/api/payments/booking/:id/order",
    auth,
    role("customer"),
    limit,
    async (req, res) => {
      const purpose = req.body.purpose || "VISIT_DEPOSIT";
      if (!["VISIT_DEPOSIT", "FINAL_BALANCE"].includes(purpose))
        fail(400, "Choose deposit or approved balance.");
      if (
        (purpose === "VISIT_DEPOSIT"
          ? req.body.acceptDeposit
          : req.body.acceptBalance) !== true
      )
        fail(400, "Explicitly review and accept this payment amount.");
      const options = paymentOptions();
      if (!options.enabled) fail(503, options.notice);
      let b = await bookingFor(req.params.id, req.user);
      if (b.paymentPlan && b.paymentPlan.mode !== options.mode)
        fail(
          409,
          "This booking keeps its original payment mode. Restore that configuration.",
        );
      if (
        b.provider?.status !== "ACTIVE" ||
        b.provider?.profile?.status !== "APPROVED"
      )
        fail(
          409,
          "This professional is unavailable for collection. Contact support.",
        );
      let p = await Payment.findOne({
        booking: b._id,
        ...(purpose === "VISIT_DEPOSIT"
          ? { $or: [{ purpose }, { purpose: { $exists: false } }] }
          : { purpose }),
      });
      let reservation;
      if (purpose === "VISIT_DEPOSIT") {
        if (!allowed.includes(b.status))
          fail(
            409,
            "Deposit is available only after provider acceptance on an eligible booking.",
          );
      } else {
        await requirePaymentIndexes(Payment.collection);
        if (b.paymentPlan?.type !== NEW_PLAN || b.status !== "COMPLETED")
          fail(
            409,
            "Balance collection requires this plan and completed service.",
          );
        if (b.billing?.balancePayment) {
          await refreshCredits(b, gateway);
          b = await bookingFor(req.params.id, req.user);
          p = await Payment.findById(b.billing.balancePayment);
          reservation = {
            id: b.billing.balancePayment,
            amount: b.billing.frozenAmount,
            version: b.billing.frozenVersion,
            credit: b.billing.frozenCredit,
          };
        } else {
          await refreshCredits(b, gateway);
          b = await bookingFor(req.params.id, req.user);
          const c = await paymentContext(b._id, req.user),
            bill = currentBill(b);
          if (bill?.status !== "APPROVED")
            fail(409, "The customer must approve the current final bill.");
          if (
            c.summary.pendingRefund ||
            c.summary.issue ||
            c.summary.refundReview
          )
            fail(
              409,
              "Resolve refund/reconciliation or overpayment review before further collection.",
            );
          if (c.summary.remaining === 0) {
            await markSettlement(b);
            return res.json({
              ...(await paymentContext(b._id, req.user)),
              checkoutReady: false,
            });
          }
          if (
            bill.approvedCredit !== c.summary.credit ||
            bill.approvedDue !== c.summary.remaining
          )
            fail(
              409,
              "Payment credits changed. Review and approve the updated balance before continuing.",
            );
          if (p)
            fail(
              409,
              "An unbound balance record requires administrator reconciliation.",
            );
          const f = financialState(b),
            id = new mongoose.Types.ObjectId();
          f.balancePayment = String(id);
          f.frozenAmount = c.summary.remaining;
          f.frozenVersion = bill.version;
          f.frozenCredit = c.summary.credit;
          await updateFinance(b, f);
          reservation = {
            id,
            amount: f.frozenAmount,
            version: bill.version,
            credit: f.frozenCredit,
          };
        }
      }
      let created = false;
      if (!p) {
        const id = reservation?.id || new mongoose.Types.ObjectId();
        try {
          p = await Payment.create({
            _id: id,
            booking: b._id,
            customer: req.user._id,
            provider: b.provider._id,
            mode: b.paymentPlan?.mode || options.mode,
            purpose,
            amount:
              reservation?.amount ??
              b.paymentPlan?.depositAmount ??
              Math.min(options.depositRupees * 100, rupeesToPaise(b.price)),
            currency: "INR",
            bookingEstimate: b.price,
            billVersion: reservation?.version,
            creditSnapshot: reservation?.credit,
            receipt: `${purpose === "VISIT_DEPOSIT" ? "gsdep" : "gsbal"}_${id}`,
            history: [
              {
                action: "CREATING",
                source: "CUSTOMER",
                note:
                  "Explicitly requested " +
                  purpose +
                  ". Deposit is a credit, not an extra fee.",
              },
            ],
          });
          created = true;
        } catch (e) {
          if (e.code !== 11000) throw e;
          p = await Payment.findOne({ booking: b._id, purpose });
          if (!p)
            fail(
              503,
              "Payment index or reservation conflict requires administrator reconciliation.",
            );
        }
      }
      currentMode(p);
      if (created) {
        if (p.mode === "demo")
          p = await Payment.findByIdAndUpdate(
            p._id,
            {
              $set: { orderId: `demo_order_${p._id}`, status: "READY" },
              $inc: { revision: 1 },
              $push: {
                history: {
                  action: "READY",
                  source: "DEMO",
                  note: "Classroom simulation only; no Razorpay transaction.",
                },
              },
            },
            { returnDocument: "after" },
          );
        else
          try {
            const order = await gateway.createOrder(p);
            verifyOrder(order, p);
            p = await Payment.findByIdAndUpdate(
              p._id,
              {
                $set: { orderId: order.id, status: "READY", lastError: "" },
                $inc: { revision: 1 },
                $push: {
                  history: {
                    action: "READY",
                    source: "GATEWAY",
                    note: "Razorpay test order created.",
                  },
                },
              },
              { returnDocument: "after" },
            );
          } catch (e) {
            await Payment.updateOne(
              { _id: p._id },
              {
                $set: {
                  lastError:
                    "Order creation uncertain. Reconcile this record; a second order will not be created.",
                },
              },
            );
            throw e;
          }
      } else p = await reconcilePayment(p, gateway);
      const c = await paymentContext(b._id, req.user);
      if (
        purpose === "FINAL_BALANCE" &&
        !CAPTURED.includes(p.status) &&
        c.summary.credit !== reservation.credit
      )
        fail(
          409,
          "Payment credits changed while this order was outstanding. Collection is blocked until administrator reconciliation.",
        );
      const checkoutReady =
        !!p.orderId &&
        ["READY", "FAILED"].includes(p.status) &&
        !c.summary.pendingRefund &&
        !c.summary.issue &&
        !c.summary.refundReview &&
        !c.summary.settled;
      res.json({
        ...c,
        payment: paymentView(p, b),
        checkoutReady,
        ...(p.mode === "razorpay_test"
          ? { keyId: process.env.RAZORPAY_KEY_ID }
          : {}),
      });
    },
  );
  app.post(
    "/api/payments/:id/verify",
    auth,
    role("customer"),
    limit,
    async (req, res) => {
      const p = await Payment.findOne({
        _id: oid(req.params.id),
        customer: req.user._id,
      });
      if (!p) fail(404, "Payment not found.");
      currentMode(p);
      if (
        p.mode !== "razorpay_test" ||
        req.body.razorpay_order_id !== p.orderId ||
        !/^pay_[a-zA-Z0-9]{5,80}$/.test(req.body.razorpay_payment_id || "") ||
        !validSignature(
          req.body.razorpay_signature,
          checkoutSignature(p.orderId, req.body.razorpay_payment_id),
        )
      )
        fail(400, "Payment signature does not match this order.");
      const snapshot = await gateway.fetchPayment(req.body.razorpay_payment_id);
      validateSnapshot(snapshot, p);
      const saved = await reconcilePayment(
        p,
        gateway,
        "CHECKOUT_VERIFY",
        snapshot,
      );
      await markSettlement(await Booking.findById(p.booking));
      res.json({
        ...(await paymentContext(p.booking, req.user)),
        payment: paymentView(saved, await bookingFor(p.booking, req.user)),
      });
    },
  );
  app.post("/api/payments/:id/refresh", auth, limit, async (req, res) => {
    const p = await Payment.findOne({
      _id: oid(req.params.id),
      ...scope(req.user),
    });
    if (!p) fail(404, "Payment not found.");
    const saved = await reconcilePayment(p, gateway);
    await markSettlement(await Booking.findById(p.booking));
    res.json({
      ...(await paymentContext(p.booking, req.user)),
      payment: paymentView(saved, await bookingFor(p.booking, req.user)),
    });
  });
  app.post(
    "/api/payments/booking/:id/refresh",
    auth,
    limit,
    async (req, res) => {
      const b = await bookingFor(req.params.id, req.user);
      await refreshCredits(b, gateway);
      await markSettlement(await Booking.findById(b._id));
      res.json(await paymentContext(b._id, req.user));
    },
  );
  app.post(
    "/api/payments/:id/demo",
    auth,
    role("customer"),
    limit,
    async (req, res) => {
      const p = await Payment.findOne({
        _id: oid(req.params.id),
        customer: req.user._id,
      });
      if (!p) fail(404, "Payment not found.");
      currentMode(p);
      if (p.mode !== "demo")
        fail(403, "Simulation cannot modify a gateway payment.");
      if (!["CAPTURED", "FAILED", "CANCELLED"].includes(req.body.outcome))
        fail(400, "Choose a valid simulation outcome.");
      const target =
        req.body.outcome === "CANCELLED" ? "READY" : req.body.outcome;
      const changed = await Payment.findOneAndUpdate(
        { _id: p._id, status: { $in: ["READY", "FAILED"] } },
        {
          $set: {
            status: target,
            ...(target === "CAPTURED"
              ? {
                  capturedAmount: p.amount,
                  paymentId: `demo_pay_${p._id}`,
                  method: "demo",
                }
              : {}),
            lastError:
              target === "FAILED" ? "Simulated failure. No money moved." : "",
          },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: req.body.outcome,
              source: "DEMO",
              note: "Local simulation only; no gateway transaction or real funds.",
            },
          },
        },
        { returnDocument: "after" },
      );
      await markSettlement(await Booking.findById(p.booking));
      res.json({
        ...(await paymentContext(p.booking, req.user)),
        payment: paymentView(
          changed || p,
          await bookingFor(p.booking, req.user),
        ),
      });
    },
  );
  app.post(
    "/api/payments/:id/refund-review",
    auth,
    role("customer", "admin"),
    limit,
    async (req, res) => {
      const p = await Payment.findOne({
        _id: oid(req.params.id),
        ...scope(req.user),
      });
      if (!p) fail(404, "Payment not found.");
      const b = await bookingFor(p.booking, req.user),
        f = financialState(b),
        requestId = text(req.body.requestId, "Refund review reference", 8, 80),
        reason = text(req.body.reason, "Refund review reason", 5, 500);
      f.refundReviews ||= [];
      const prior = f.refundReviews.find((r) => r.requestId === requestId);
      if (prior) return res.json({ review: prior });
      if (f.balancePayment && !f.settledAt)
        fail(
          409,
          "Reconcile the outstanding balance order before a conflicting refund review.",
        );
      const pending = await PaymentRefund.find({
          payment: p._id,
          status: "PENDING",
        }).lean(),
        reserved =
          pending.reduce((n, r) => n + r.amount, 0) +
          f.refundReviews
            .filter(
              (r) => r.payment === String(p._id) && r.status === "REQUESTED",
            )
            .reduce((n, r) => n + r.amount, 0),
        amount = paise(req.body.amount, "Refund review amount", 1);
      if (
        !CAPTURED.includes(p.status) ||
        amount >
          (p.capturedAmount ?? p.amount) - (p.refundedAmount || 0) - reserved
      )
        fail(409, "Refund review exceeds available captured funds.");
      if (f.refundReviews.length >= 30)
        fail(409, "Refund review limit reached.");
      const review = {
        id: randomUUID(),
        requestId,
        payment: String(p._id),
        amount,
        reason,
        status: "REQUESTED",
        postSettlement: !!f.settledAt,
        history: [audit("REFUND_REVIEW_REQUESTED", req.user, reason)],
      };
      f.refundReviews.push(review);
      await updateFinance(b, f);
      res.status(201).json({ review });
    },
  );
  app.post(
    "/api/payments/booking/:id/refund-review/:reviewId/close",
    auth,
    role("admin"),
    async (req, res) => {
      const b = await bookingFor(req.params.id, req.user),
        f = financialState(b),
        r = f.refundReviews?.find((r) => r.id === req.params.reviewId);
      if (!r) fail(404, "Refund review not found.");
      if (r.status === "CLOSED") return res.json({ review: r });
      r.status = "CLOSED";
      r.history.push(
        audit(
          "REVIEW_CLOSED_NOT_REFUNDED",
          req.user,
          text(req.body.reason, "Resolution reason", 5, 500),
        ),
      );
      await updateFinance(b, f);
      res.json({ review: r });
    },
  );
  app.post(
    "/api/payments/:id/demo-refund",
    auth,
    role("admin"),
    limit,
    async (req, res) => {
      let p = await Payment.findById(oid(req.params.id));
      if (!p) fail(404, "Payment not found.");
      currentMode(p);
      if (p.mode !== "demo")
        fail(
          403,
          "Issue an actual test refund in Razorpay Dashboard, then reconcile.",
        );
      if (req.body.confirm !== true)
        fail(400, "Confirm the local refund simulation.");
      const b = await bookingFor(p.booking, req.user);
      if (b.billing?.balancePayment && !b.billing?.settledAt)
        fail(
          409,
          "Reconcile the outstanding balance order before a conflicting refund.",
        );
      const refundId = `demo_refund_${p._id}_${req.body.requestId ? text(req.body.requestId, "Refund reference", 8, 80) : "full"}`;
      const f = financialState(b);
      f.demoRefunds ||= [];
      let reservation = f.demoRefunds.find((r) => r.id === refundId);
      if (!reservation) {
        const allocated = Math.max(
          p.refundedAmount || 0,
          f.demoRefunds
            .filter((r) => r.payment === String(p._id))
            .reduce((n, r) => n + r.amount, 0),
        );
        const amount = paise(
          req.body.amount ?? p.amount - allocated,
          "Refund amount",
          1,
        );
        if (!CAPTURED.includes(p.status) || amount > p.amount - allocated)
          fail(409, "Refund cannot exceed the captured balance.");
        reservation = {
          id: refundId,
          payment: String(p._id),
          amount,
          status: "RESERVED",
        };
        f.demoRefunds.push(reservation);
        await updateFinance(b, f);
      }
      const amount = reservation.amount;
      try {
        await PaymentRefund.create({
          payment: p._id,
          booking: p.booking,
          customer: p.customer,
          provider: p.provider,
          mode: "demo",
          gatewayRefundId: refundId,
          amount,
          status: "PROCESSED",
          postSettlement: !!b.billing?.settledAt,
          reason: "Explicit local refund simulation; no money moved.",
          history: [audit("PROCESSED_SIMULATION", req.user)],
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
      p = await syncDemoRefunds(p);
      for (let i = 0; i < 4; i++) {
        const latest = await Booking.findById(b._id),
          f = financialState(latest),
          entry = f.demoRefunds?.find((r) => r.id === refundId);
        if (!entry || entry.status === "DONE") break;
        entry.status = "DONE";
        try {
          await updateFinance(latest, f);
          break;
        } catch (e) {
          if (e.status !== 409) throw e;
        }
      }
      res.json({
        ...(await paymentContext(p.booking, req.user)),
        payment: paymentView(p, b),
      });
    },
  );
  mountBilling(app, {
    context: async (id, user) => {
      const b = await bookingFor(id, user);
      return { ...(await paymentContext(id, user)), booking: b };
    },
    refreshCredits: (b) => refreshCredits(b, gateway),
  });
}
