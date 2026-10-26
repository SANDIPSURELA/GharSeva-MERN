import { randomUUID, createHash } from "node:crypto";
import { Booking, Payment, PaymentRefund } from "./models.js";
import { auth, role } from "./auth.js";
import { fail, text } from "./domain.js";
import {
  NEW_PLAN,
  financialState,
  currentBill,
  calculateBill,
  paise,
  paymentSummary,
} from "./billing-domain.js";
export const audit = (action, user, note = "") => ({
  action,
  actor: String(user._id),
  at: new Date().toISOString(),
  note,
});
export async function updateFinance(b, next) {
  const revision = b.billing?.revision || 0;
  const saved = await Booking.findOneAndUpdate(
    {
      _id: b._id,
      status: b.status,
      ...(revision
        ? { "billing.revision": revision }
        : {
            $or: [
              { "billing.revision": 0 },
              { "billing.revision": { $exists: false } },
            ],
          }),
    },
    { $set: { billing: { ...next, revision: revision + 1 } } },
    { returnDocument: "after" },
  );
  if (!saved) fail(409, "Billing changed. Refresh before continuing.");
  return saved;
}
export async function markSettlement(b) {
  if (b.paymentPlan?.type !== NEW_PLAN || b.billing?.settledAt) return b;
  const bill = currentBill(b);
  if (!bill || bill.status !== "APPROVED") return b;
  const payments = await Payment.find({ booking: b._id }).lean(),
    refunds = await PaymentRefund.find({ booking: b._id }).lean();
  const summary = paymentSummary(b, payments, refunds);
  if (
    summary.remaining !== 0 ||
    summary.overpayment ||
    summary.pendingRefund ||
    summary.issue
  )
    return b;
  const f = financialState(b);
  f.settledAt = new Date().toISOString();
  f.settledVersion = bill.version;
  f.settledTotal = bill.total;
  f.settledCredits = summary.settled ? bill.total : summary.credit;
  f.refundedAtSettlement = summary.processedRefunds;
  try {
    return await updateFinance(b, f);
  } catch (e) {
    if (e.status !== 409) throw e;
    return await Booking.findById(b._id);
  }
}
export function mountBilling(app, { context, refreshCredits }) {
  const get = async (req) => {
    const c = await context(req.params.id, req.user);
    if (c.booking.paymentPlan?.type !== NEW_PLAN)
      fail(
        409,
        "This historical booking keeps its original optional-deposit workflow.",
      );
    return c;
  };
  const editable = (b) => {
    if (b.billing?.balancePayment || b.billing?.settledAt)
      fail(
        409,
        "The approved bill is frozen against a payment or settlement. Reconcile it before any further action.",
      );
  };
  app.post(
    "/api/payments/booking/:id/extras",
    auth,
    role("provider"),
    async (req, res) => {
      const { booking: b } = await get(req);
      editable(b);
      if (!["ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"].includes(b.status))
        fail(409, "Propose extra work before completing the service.");
      if (req.user.profile?.status !== "APPROVED")
        fail(403, "An approved assigned professional is required.");
      const f = financialState(b);
      if (f.extras.length >= 40) fail(400, "Extra proposal limit reached.");
      const quantity = paise(req.body.quantity, "Quantity", 1);
      if (quantity > 1000) fail(400, "Quantity cannot exceed 1000.");
      const unitAmount = paise(req.body.unitAmount, "Extra unit amount", 1),
        amount = paise(quantity * unitAmount, "Extra total", 1);
      const proposal = {
        id: randomUUID(),
        label: text(req.body.label, "Extra description", 2, 120),
        kind: ["WORK", "MATERIAL"].includes(req.body.kind)
          ? req.body.kind
          : "WORK",
        quantity,
        unitAmount,
        amount,
        status: "PROPOSED",
        history: [audit("PROPOSED", req.user)],
      };
      f.extras.push(proposal);
      await updateFinance(b, f);
      res.status(201).json({ extra: proposal });
    },
  );
  app.post(
    "/api/payments/booking/:id/extras/:extraId/decision",
    auth,
    role("customer"),
    async (req, res) => {
      const { booking: b } = await get(req);
      editable(b);
      if (!["ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"].includes(b.status))
        fail(409, "Review extra work before service completion.");
      if (!["APPROVED", "DECLINED"].includes(req.body.decision))
        fail(400, "Approve or decline this extra.");
      const f = financialState(b),
        extra = f.extras.find((x) => x.id === req.params.extraId);
      if (!extra) fail(404, "Extra proposal not found.");
      if (extra.status === req.body.decision) return res.json({ extra });
      if (extra.status !== "PROPOSED")
        fail(409, "This proposal already has a recorded decision.");
      extra.status = req.body.decision;
      extra.history.push(audit(extra.status, req.user));
      await updateFinance(b, f);
      res.json({ extra });
    },
  );
  app.post(
    "/api/payments/booking/:id/bill",
    auth,
    role("provider"),
    async (req, res) => {
      const { booking: b } = await get(req);
      editable(b);
      if (b.status !== "COMPLETED")
        fail(409, "Submit the final bill after service completion.");
      const f = financialState(b),
        requestId = text(req.body.requestId, "Submission reference", 8, 80);
      if (!/^[a-zA-Z0-9-]+$/.test(requestId))
        fail(400, "Use a valid submission reference.");
      const bill = calculateBill(req.body.items, b),
        digest = createHash("sha256")
          .update(JSON.stringify(bill))
          .digest("hex");
      const prior = f.versions.find((v) => v.requestId === requestId);
      if (prior) {
        if (prior.digest !== digest)
          fail(409, "Submission reference was reused with different items.");
        return res.json({ bill: prior });
      }
      const current = currentBill(b);
      if (current && current.status !== "CORRECTION_REQUESTED")
        fail(
          409,
          "The customer must request a correction before a new bill version.",
        );
      if (f.versions.length >= 30)
        fail(409, "Bill revision limit reached. Contact support.");
      const version = {
        ...bill,
        version: f.version + 1,
        status: "SUBMITTED",
        requestId,
        digest,
        history: [audit("SUBMITTED", req.user)],
      };
      f.version = version.version;
      f.versions.push(version);
      await updateFinance(b, f);
      res.status(201).json({ bill: version });
    },
  );
  app.post(
    "/api/payments/booking/:id/bill/decision",
    auth,
    role("customer"),
    async (req, res) => {
      let { booking: b } = await get(req);
      editable(b);
      if (b.status !== "COMPLETED") fail(409, "The service must be completed.");
      const version = paise(req.body.version, "Bill version", 1);
      let bill = currentBill(b);
      if (
        !bill ||
        bill.version !== version ||
        !["SUBMITTED", "APPROVED"].includes(bill.status)
      )
        fail(409, "Review the current submitted bill.");
      if (req.body.decision === "APPROVED") {
        if (req.body.confirm !== true)
          fail(400, "Explicitly approve the bill before payment.");
        await refreshCredits(b);
        b = (await context(req.params.id, req.user)).booking;
        editable(b);
        bill = currentBill(b);
        if (
          !bill ||
          bill.version !== version ||
          !["SUBMITTED", "APPROVED"].includes(bill.status)
        )
          fail(409, "The bill changed. Review again.");
        const c = await context(req.params.id, req.user);
        if (c.summary.pendingRefund || c.summary.issue)
          fail(
            409,
            "Resolve payment/refund reconciliation before bill approval.",
          );
        const f = financialState(b),
          target = f.versions.find((v) => v.version === version);
        target.status = "APPROVED";
        target.approvedCredit = c.summary.credit;
        target.approvedDue = Math.max(0, target.total - c.summary.credit);
        target.history.push(audit("CUSTOMER_APPROVED", req.user));
        b = await updateFinance(b, f);
        await markSettlement(b);
      } else if (req.body.decision === "CORRECTION_REQUESTED") {
        const reason = text(req.body.reason, "Correction reason", 5, 500),
          f = financialState(b),
          target = f.versions.find((v) => v.version === version);
        target.status = "CORRECTION_REQUESTED";
        target.correctionReason = reason;
        target.history.push(audit("CORRECTION_REQUESTED", req.user, reason));
        await updateFinance(b, f);
      } else fail(400, "Approve the bill or request a correction.");
      res.json(await context(req.params.id, req.user));
    },
  );
}
