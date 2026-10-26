import { sessionFetch } from "./session-fixture.js";
import { fixtureCookie } from "./session-fixture.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import {
  User,
  Booking,
  Payment,
  PaymentEvent,
  PaymentRefund,
} from "../src/models.js";
import { razorpayGateway, paymentOptions } from "../src/payment-gateway.js";
let db,
  server,
  url,
  customer,
  other,
  provider,
  admin,
  booking,
  gateway,
  calls,
  snapshot,
  lastOrder,
  createFails,
  orderSnapshots,
  refundSnapshots;
const sig = (order, payment) =>
  createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${order}|${payment}`)
    .digest("hex");
const cookie = (u) => fixtureCookie(u);
async function call(
  path,
  {
    as = customer,
    body,
    method = body ? "POST" : "GET",
    raw,
    signature,
    eventId,
    requestHeader = true,
  } = {},
) {
  const r = await sessionFetch(url + path, {
    method,
    headers: {
      ...(requestHeader ? { "X-GharSeva": "1" } : {}),
      ...(as ? { Cookie: await cookie(as) } : {}),
      ...(body || raw ? { "Content-Type": "application/json" } : {}),
      ...(signature ? { "X-Razorpay-Signature": signature } : {}),
      ...(eventId ? { "X-Razorpay-Event-Id": eventId } : {}),
    },
    ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const order = (extra = {}, as = customer) =>
  call(`/payments/booking/${booking._id}/order`, {
    as,
    body: { acceptDeposit: true, ...extra },
  });
function gatewayMode() {
  process.env.PAYMENTS_MODE = "razorpay_test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_Classroom";
  process.env.RAZORPAY_KEY_SECRET = "fixture-secret-not-a-real-key";
  process.env.RAZORPAY_WEBHOOK_SECRET = "fixture-webhook-secret-not-real";
}
async function verified(p, overrides = {}) {
  return call(`/payments/${p._id}/verify`, {
    body: {
      razorpay_order_id: p.orderId,
      razorpay_payment_id: snapshot.id,
      razorpay_signature: sig(p.orderId, snapshot.id),
      ...overrides,
    },
  });
}
async function hook(
  event = "payment.captured",
  { id = "evt_classroom", raw, invalid = false } = {},
) {
  const body =
    raw ||
    JSON.stringify({
      event,
      payload: event.startsWith("refund.")
        ? { refund: { entity: { payment_id: snapshot.id } } }
        : { payment: { entity: { id: snapshot.id } } },
    });
  const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return call("/payments/webhook", {
    as: null,
    method: "POST",
    raw: body,
    signature: invalid ? "0".repeat(64) : signature,
    eventId: id,
    requestHeader: false,
  });
}
before(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.NODE_ENV = "test";
  process.env.GHARSEVA_DEMO = "true";
  process.env.AUTH_DELIVERY_MODE = "test";
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: {
      args: [
        ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
        "--setParameter",
        "diagnosticDataCollectionEnabled=false",
      ],
    },
  });
  await mongoose.connect(db.getUri(), { serverSelectionTimeoutMS: 10000 });
  await Promise.all([
    User.init(),
    Booking.init(),
    Payment.init(),
    PaymentEvent.init(),
    PaymentRefund.init(),
  ]);
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (db) await db.stop();
});
beforeEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  process.env.NODE_ENV = "test";
  process.env.PAYMENTS_MODE = "demo";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.PAYMENT_DEPOSIT_RUPEES;
  await Promise.all([
    Payment.deleteMany({}),
    PaymentEvent.deleteMany({}),
    PaymentRefund.deleteMany({}),
    Booking.deleteMany({}),
    User.deleteMany({}),
  ]);
  [customer, other, provider, admin] = await User.create([
    {
      name: "Classroom Customer",
      email: "customer@example.com",
      mobile: "9876500101",
      passwordHash: "fixture",
      role: "customer",
    },
    {
      name: "Other Customer",
      email: "other@example.com",
      mobile: "9876500102",
      passwordHash: "fixture",
      role: "customer",
    },
    {
      name: "Classroom Professional",
      email: "provider@example.com",
      mobile: "9876500103",
      passwordHash: "fixture",
      role: "provider",
      profile: { category: "plumbing", status: "APPROVED", price: 349 },
    },
    {
      name: "Classroom Admin",
      email: "admin@example.com",
      mobile: "9876500104",
      passwordHash: "fixture",
      role: "admin",
    },
  ]);
  booking = await Booking.create({
    customer: customer._id,
    provider: provider._id,
    service: "Plumbing",
    category: "plumbing",
    date: "2026-11-02",
    time: "09:00",
    address: "42 Fictional Lane, Ahmedabad",
    price: 349,
    status: "ACCEPTED",
  });
  calls = [];
  lastOrder = null;
  createFails = false;
  orderSnapshots = null;
  refundSnapshots = [];
  snapshot = {
    id: "pay_Classroom123",
    order_id: "",
    amount: 9900,
    currency: "INR",
    status: "captured",
    captured: true,
    amount_refunded: 0,
    method: "upi",
  };
  gateway = {
    createOrder: async (p) => {
      calls.push("create");
      lastOrder = {
        id: `order_${String(p._id)}`,
        amount: p.amount,
        currency: p.currency,
        receipt: p.receipt,
      };
      snapshot.order_id = lastOrder.id;
      if (createFails)
        throw Object.assign(new Error("Gateway request uncertain"), {
          status: 503,
        });
      return lastOrder;
    },
    findOrder: async () => {
      calls.push("find");
      return lastOrder;
    },
    fetchOrder: async () => ({
      ...lastOrder,
      status: snapshot.captured ? "paid" : "created",
    }),
    paymentRefunds: async () => {
      const recorded = refundSnapshots.reduce((n, r) => n + r.amount, 0);
      if (snapshot.amount_refunded > recorded)
        refundSnapshots.push({
          id: "rfnd_Classroom" + refundSnapshots.length,
          payment_id: snapshot.id,
          amount: snapshot.amount_refunded - recorded,
          currency: "INR",
          status: "processed",
        });
      return structuredClone(refundSnapshots);
    },
    fetchPayment: async () => {
      calls.push("fetch");
      return { ...snapshot };
    },
    orderPayments: async () => {
      calls.push("list");
      return orderSnapshots || [{ ...snapshot }];
    },
  };
  server = createApp({ paymentGateway: gateway }).listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}/api`;
});
test("payments remain disabled without configuration and production cannot enable classroom simulation or live keys", async () => {
  process.env.PAYMENTS_MODE = "disabled";
  assert.equal((await order()).status, 503);
  assert.equal(await Payment.countDocuments(), 0);
  process.env.PAYMENTS_MODE = "demo";
  process.env.NODE_ENV = "production";
  assert.equal(paymentOptions().enabled, false);
  process.env.NODE_ENV = "test";
  gatewayMode();
  process.env.RAZORPAY_KEY_ID = "rzp_live_NotAllowed";
  assert.equal(paymentOptions().enabled, false);
  assert.equal((await order()).status, 503);
});
test("only the owning customer can create a deposit and explicit amount acceptance is required", async () => {
  assert.equal((await order({}, null)).status, 401);
  assert.equal((await order({}, provider)).status, 403);
  assert.equal((await order({}, admin)).status, 403);
  assert.equal((await order({}, other)).status, 404);
  assert.equal(
    (await call(`/payments/booking/${booking._id}/order`, { body: {} })).status,
    400,
  );
});
test("deposit eligibility follows accepted booking states and never changes the booking journey", async () => {
  for (const status of ["PENDING", "CANCELLED", "REJECTED", "COMPLETED"]) {
    await Booking.updateOne({ _id: booking._id }, { $set: { status } });
    assert.equal((await order()).status, 409);
  }
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { status: "ACCEPTED" } },
  );
  assert.equal((await order()).status, 200);
  assert.equal((await Booking.findById(booking._id)).status, "ACCEPTED");
});
test("server derives the deposit, currency and owner from the saved booking and reuses one order", async () => {
  const a = await order({ amount: 1, currency: "USD", customer: other._id });
  assert.equal(a.status, 200);
  assert.equal(a.data.payment.amount, 9900);
  assert.equal(a.data.payment.currency, "INR");
  assert.equal(String(a.data.payment.customer), String(customer._id));
  assert.equal(a.data.payment.mode, "demo");
  const b = await order();
  assert.equal(a.data.payment._id, b.data.payment._id);
  assert.equal(a.data.payment.orderId, b.data.payment.orderId);
  assert.equal(await Payment.countDocuments(), 1);
  assert.equal(calls.length, 0);
});
test("concurrent deposit requests create only one ledger and order reference", async () => {
  const results = await Promise.all([order(), order()]);
  assert.equal(results.filter((r) => r.status === 200).length, 2);
  assert.equal(results[0].data.payment._id, results[1].data.payment._id);
  assert.equal(await Payment.countDocuments(), 1);
});
test("classroom failure, cancellation, success and duplicate clicks never move real funds", async () => {
  const p = (await order()).data.payment;
  const outcome = (value) =>
    call(`/payments/${p._id}/demo`, { body: { outcome: value } });
  assert.equal((await outcome("FAILED")).data.payment.status, "FAILED");
  assert.equal((await outcome("CANCELLED")).data.payment.status, "READY");
  assert.equal((await outcome("CAPTURED")).data.payment.status, "CAPTURED");
  assert.equal((await outcome("CAPTURED")).data.payment.status, "CAPTURED");
  assert.equal(
    (await Payment.findById(p._id)).history.filter(
      (h) => h.action === "CAPTURED",
    ).length,
    1,
  );
  assert.equal((await Booking.findById(booking._id)).status, "ACCEPTED");
  assert.equal(calls.length, 0);
});
test("receipt and list scopes exclude other customers and unrelated providers", async () => {
  await order();
  assert.equal(
    (await call(`/payments/booking/${booking._id}`, { as: other })).status,
    404,
  );
  assert.equal((await call("/payments", { as: other })).data.total, 0);
  const own = await call(`/payments/booking/${booking._id}`, { as: provider });
  assert.equal(own.status, 200);
  assert.equal(own.data.canPay, false);
  assert.equal(own.data.booking.address, undefined);
  assert.equal(own.data.payment.bookingInfo.customer, "Classroom Customer");
  assert.equal((await call("/payments", { as: admin })).data.total, 1);
});
test("mode changes cannot turn simulated deposits into gateway payments", async () => {
  const p = (await order()).data.payment;
  gatewayMode();
  assert.equal(
    (await call(`/payments/${p._id}/demo`, { body: { outcome: "CAPTURED" } }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/payments/${p._id}/refresh`, { body: {} })).status,
    409,
  );
});
test("only admin can simulate an idempotent full refund of a captured local deposit", async () => {
  const p = (await order()).data.payment;
  assert.equal(
    (
      await call(`/payments/${p._id}/demo-refund`, {
        as: admin,
        body: { confirm: true },
      })
    ).status,
    409,
  );
  await call(`/payments/${p._id}/demo`, { body: { outcome: "CAPTURED" } });
  assert.equal(
    (await call(`/payments/${p._id}/demo-refund`, { body: { confirm: true } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(`/payments/${p._id}/demo-refund`, {
        as: admin,
        body: { confirm: false },
      })
    ).status,
    400,
  );
  for (let i = 0; i < 2; i++) {
    const r = await call(`/payments/${p._id}/demo-refund`, {
      as: admin,
      body: { confirm: true },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.payment.refundedAmount, 9900);
  }
  assert.equal(
    (await Payment.findById(p._id)).history.filter(
      (h) => h.action === "REFUNDED",
    ).length,
    1,
  );
});
test("a cancelled booking with a captured deposit is flagged for refund review without erasing history", async () => {
  const p = (await order()).data.payment;
  await call(`/payments/${p._id}/demo`, { body: { outcome: "CAPTURED" } });
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { status: "CANCELLED", active: false } },
  );
  const r = await call(`/payments/booking/${booking._id}`);
  assert.equal(r.data.payment.refundReviewNeeded, true);
  assert.equal(r.data.payment.status, "CAPTURED");
  assert.equal((await order()).status, 409);
});
test("Razorpay test orders use one server reference and never expose secret keys", async () => {
  gatewayMode();
  const a = await order();
  assert.equal(a.status, 200);
  assert.equal(a.data.keyId, "rzp_test_Classroom");
  assert.equal(a.data.payment.mode, "razorpay_test");
  assert.equal(lastOrder.amount, 9900);
  assert.equal(lastOrder.currency, "INR");
  assert.equal(lastOrder.receipt, a.data.payment.receipt);
  assert.equal(
    JSON.stringify(a.data).includes(process.env.RAZORPAY_KEY_SECRET),
    false,
  );
  await order();
  assert.equal(calls.filter((c) => c === "create").length, 1);
});
test("checkout signatures bind the stored order and reject forged callbacks and wrong owners", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  assert.equal(
    (await verified(p, { razorpay_signature: "0".repeat(64) })).status,
    400,
  );
  assert.equal(
    (
      await verified(p, {
        razorpay_order_id: "order_Foreign123",
        razorpay_signature: sig("order_Foreign123", snapshot.id),
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/payments/${p._id}/verify`, { as: other, body: {} })).status,
    404,
  );
  assert.equal((await Payment.findById(p._id)).status, "READY");
});
test("valid checkout proof still requires authoritative gateway amount, currency and order checks", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  for (const [field, value] of [
    ["amount", 1],
    ["currency", "USD"],
    ["order_id", "order_Foreign123"],
  ]) {
    const saved = snapshot[field];
    snapshot[field] = value;
    assert.equal((await verified(p)).status, 409);
    snapshot[field] = saved;
  }
  const paid = await verified(p);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.payment.status, "CAPTURED");
  assert.equal((await Booking.findById(booking._id)).status, "ACCEPTED");
});
test("authorisation stays pending and out-of-order failed or authorised records cannot downgrade a capture", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  snapshot.status = "authorized";
  snapshot.captured = false;
  assert.equal((await verified(p)).data.payment.status, "AUTHORIZED");
  snapshot.status = "captured";
  snapshot.captured = true;
  assert.equal((await verified(p)).data.payment.status, "CAPTURED");
  snapshot.status = "failed";
  snapshot.captured = false;
  const r = await call(`/payments/${p._id}/refresh`, { body: {} });
  assert.equal(r.data.payment.status, "CAPTURED");
});
test("refresh reconciles refund amounts monotonically and reports a full refund separately", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  await verified(p);
  snapshot.amount_refunded = 1000;
  assert.equal(
    (await call(`/payments/${p._id}/refresh`, { body: {} })).data.payment
      .status,
    "PARTIALLY_REFUNDED",
  );
  snapshot.amount_refunded = 0;
  assert.equal(
    (await call(`/payments/${p._id}/refresh`, { body: {} })).data.payment
      .refundedAmount,
    1000,
  );
  snapshot.amount_refunded = 9900;
  snapshot.status = "refunded";
  const full = await call(`/payments/${p._id}/refresh`, { body: {} });
  assert.equal(full.data.payment.status, "REFUNDED");
  assert.equal(full.data.payment.refundedAmount, 9900);
});
test("signed raw-body webhook works without the application header and rejects invalid or reserialised signatures", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  assert.equal((await hook("payment.captured", { invalid: true })).status, 401);
  const good = await hook();
  assert.equal(good.status, 200);
  assert.equal((await Payment.findById(p._id)).status, "CAPTURED");
  const raw =
    '{"event":"payment.captured", "payload":{"payment":{"entity":{"id":"pay_Classroom123"}}}}';
  const wrong = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(JSON.parse(raw)))
    .digest("hex");
  assert.equal(
    (
      await call("/payments/webhook", {
        method: "POST",
        as: null,
        raw,
        signature: wrong,
        requestHeader: false,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(`/payments/booking/${booking._id}/order`, {
        method: "POST",
        body: { acceptDeposit: true },
        requestHeader: false,
      })
    ).status,
    403,
  );
});
test("duplicate webhooks are idempotent and the same event reference cannot change its payload", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  assert.equal((await hook()).status, 200);
  assert.equal((await hook()).data.duplicate, true);
  assert.equal(
    (await Payment.findById(p._id)).history.filter(
      (h) => h.action === "CAPTURED",
    ).length,
    1,
  );
  assert.equal((await hook("payment.authorized")).status, 409);
});
test("refund and earlier event notifications fetch current payment state rather than trusting old payload snapshots", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  assert.equal((await hook("payment.authorized")).status, 200);
  assert.equal((await Payment.findById(p._id)).status, "CAPTURED");
  snapshot.status = "refunded";
  snapshot.amount_refunded = 9900;
  assert.equal(
    (await hook("refund.processed", { id: "evt_refund" })).status,
    200,
  );
  assert.equal((await Payment.findById(p._id)).status, "REFUNDED");
});
test("uncertain order creation is not duplicated and can be recovered by its trusted receipt", async () => {
  gatewayMode();
  createFails = true;
  assert.equal((await order()).status, 503);
  const p = await Payment.findOne({ booking: booking._id });
  assert.equal(p.status, "CREATING");
  assert.equal((await order()).data.checkoutReady, false);
  assert.equal(calls.filter((c) => c === "create").length, 1);
  const refreshed = await call(`/payments/${p._id}/refresh`, { body: {} });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.payment.orderId, lastOrder.id);
  assert.equal(refreshed.data.payment.status, "CAPTURED");
});
test("simulation endpoints cannot change gateway records and unknown webhook events are ignored safely", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  assert.equal(
    (await call(`/payments/${p._id}/demo`, { body: { outcome: "CAPTURED" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(`/payments/${p._id}/demo-refund`, {
        as: admin,
        body: { confirm: true },
      })
    ).status,
    403,
  );
  const ignored = await hook("customer.created");
  assert.equal(ignored.status, 200);
  assert.equal(ignored.data.ignored, true);
});
test("Razorpay HTTP adapter pins the API origin and uses server-only test credentials and paise amounts", async () => {
  gatewayMode();
  const seen = [];
  const adapter = razorpayGateway(async (url, options) => {
    seen.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: "order_Example123", items: [] }),
    };
  });
  await adapter.createOrder({
    _id: "sample-payment",
    amount: 9900,
    currency: "INR",
    receipt: "receipt_sample",
  });
  assert.equal(seen[0].url, "https://api.razorpay.com/v1/orders");
  const body = JSON.parse(seen[0].options.body);
  assert.equal(body.amount, 9900);
  assert.equal(body.partial_payment, false);
  assert.deepEqual(Object.keys(body.notes), ["gharseva_payment_id"]);
  assert.match(seen[0].options.headers.Authorization, /^Basic /);
  assert.throws(
    () => adapter.fetchPayment("https://evil.example"),
    /Invalid gateway reference/,
  );
  process.env.RAZORPAY_KEY_ID = "rzp_live_NotAllowed";
  await assert.rejects(
    () =>
      adapter.createOrder({
        _id: "sample",
        amount: 9900,
        currency: "INR",
        receipt: "receipt",
      }),
    /Live keys are not accepted/,
  );
  assert.equal(seen.length, 1);
});

test("concurrent checkout verification and webhook processing record one capture", async () => {
  gatewayMode();
  const p = (await order()).data.payment;
  const results = await Promise.all([verified(p), hook()]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(
    (await Payment.findById(p._id)).history.filter(
      (h) => h.action === "CAPTURED",
    ).length,
    1,
  );
});
test("new gateway orders require a currently active approved professional", async () => {
  await User.updateOne(
    { _id: provider._id },
    { $set: { status: "SUSPENDED" } },
  );
  assert.equal((await order()).status, 409);
  assert.equal(await Payment.countDocuments(), 0);
});
test("HTTP two-stage journey keeps visit OTP, correction history and separate deposit/balance records", async () => {
  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        paymentPlan: {
          type: "DEPOSIT_BALANCE_V1",
          mode: "demo",
          depositAmount: 9900,
          estimateAmount: 34900,
          currency: "INR",
        },
        status: "ON_THE_WAY",
        visitCode: "123456",
      },
    },
  );
  const status = (value) =>
    call(`/bookings/${booking._id}/status`, {
      as: provider,
      body: { status: value, code: "123456" },
    });
  assert.equal((await status("IN_PROGRESS")).status, 409);
  const d = (await order()).data.payment;
  await call(`/payments/${d._id}/demo`, { body: { outcome: "CAPTURED" } });
  assert.equal((await status("IN_PROGRESS")).status, 200);
  assert.equal((await status("COMPLETED")).status, 200);
  const submit = (requestId, unitAmount) =>
    call(`/payments/booking/${booking._id}/bill`, {
      as: provider,
      body: {
        requestId,
        items: [
          { kind: "SERVICE", label: "Service charge", quantity: 1, unitAmount },
        ],
        total: 1,
      },
    });
  assert.equal(
    (await submit("original-bill-001", 34900)).data.bill.total,
    34900,
  );
  assert.equal(
    (
      await call(`/payments/booking/${booking._id}/bill/decision`, {
        as: provider,
        body: { version: 1, decision: "APPROVED", confirm: true },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/payments/booking/${booking._id}/bill/decision`, {
        body: {
          version: 1,
          decision: "CORRECTION_REQUESTED",
          reason: "Please correct the labour charge",
        },
      })
    ).status,
    200,
  );
  await submit("corrected-bill-002", 29900);
  assert.equal(
    (
      await call(`/payments/booking/${booking._id}/bill/decision`, {
        body: { version: 2, decision: "APPROVED", confirm: true },
      })
    ).status,
    200,
  );
  const balance = await order({
    purpose: "FINAL_BALANCE",
    acceptBalance: true,
    amount: 29900,
  });
  assert.equal(balance.status, 200);
  assert.equal(balance.data.payment.amount, 20000);
  assert.notEqual(balance.data.payment.orderId, d.orderId);
  await call(`/payments/${balance.data.payment._id}/demo`, {
    body: { outcome: "FAILED" },
  });
  assert.equal((await Booking.findById(booking._id)).status, "COMPLETED");
  await call(`/payments/${balance.data.payment._id}/demo`, {
    body: { outcome: "CAPTURED" },
  });
  const c = (await call(`/payments/booking/${booking._id}`)).data;
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.grossCaptured, 29900);
  assert.equal(c.summary.payoutStatus, "NOT_INITIATED");
  assert.equal(c.payments.length, 2);
  assert.equal(c.booking.billing.versions.length, 2);
});

test("temporary Mongo index migration preserves legacy receipt and permits a separate balance only", async () => {
  const { migratePaymentIndexes } = await import("../src/payment-indexes.js");
  const collection = mongoose.connection.collection(
    "payment_migration_fixture",
  );
  const original = {
    _id: new mongoose.Types.ObjectId(),
    booking: booking._id,
    customer: customer._id,
    provider: provider._id,
    amount: 9900,
    currency: "INR",
    mode: "demo",
    receipt: "legacy_fixture_receipt",
    status: "CAPTURED",
    paymentId: "demo_legacy_fixture",
  };
  try {
    await collection.insertOne(original);
    await collection.createIndex(
      { booking: 1 },
      { unique: true, name: "booking_1" },
    );
    await collection.createIndex(
      { receipt: 1 },
      { unique: true, name: "receipt_1" },
    );
    const before = await collection.findOne({ _id: original._id });
    const indexesBefore = await collection.indexes();
    await assert.rejects(
      () => migratePaymentIndexes(collection, { apply: true }),
      /confirmation/,
    );
    await assert.rejects(
      () =>
        migratePaymentIndexes(collection, {
          apply: true,
          confirmedDatabase: "wrong_database",
        }),
      /confirmation/,
    );
    const dry = await migratePaymentIndexes(collection);
    assert.deepEqual(await collection.indexes(), indexesBefore);
    assert.equal(dry.apply, false);
    assert.deepEqual(await collection.findOne({ _id: original._id }), before);
    await migratePaymentIndexes(collection, {
      apply: true,
      confirmedDatabase: mongoose.connection.name,
    });
    assert.deepEqual(await collection.findOne({ _id: original._id }), {
      ...before,
      purpose: "VISIT_DEPOSIT",
    });
    await migratePaymentIndexes(collection, {
      apply: true,
      confirmedDatabase: mongoose.connection.name,
    });
    assert.ok((await collection.indexes()).some((i) => i.name === "receipt_1"));
    assert.ok(
      !(await collection.indexes()).some((i) => i.name === "booking_1"),
    );
    await collection.insertOne({
      ...original,
      _id: new mongoose.Types.ObjectId(),
      purpose: "FINAL_BALANCE",
      receipt: "balance_fixture_receipt",
      amount: 25000,
      paymentId: "demo_balance_fixture",
    });
    await assert.rejects(
      () =>
        collection.insertOne({
          ...original,
          _id: new mongoose.Types.ObjectId(),
          purpose: "FINAL_BALANCE",
          receipt: "another_fixture_receipt",
        }),
      (e) => e.code === 11000,
    );
    assert.equal(await collection.countDocuments(), 2);
    assert.equal(await User.countDocuments(), 4);
    assert.equal(await Booking.countDocuments(), 1);
  } finally {
    await collection.drop();
  }
});

test("disposable Mongo refuses unsafe migration data/indexes before changing any record or index", async () => {
  const { migratePaymentIndexes } = await import("../src/payment-indexes.js");
  const collection = mongoose.connection.collection(
    "payment_migration_refusal_fixture",
  );
  const row = {
    booking: booking._id,
    amount: 9900,
    currency: "INR",
    receipt: "preserve",
    capturedAmount: 9900,
    history: [{ action: "CAPTURED" }],
  };
  const apply = () =>
    migratePaymentIndexes(collection, {
      apply: true,
      confirmedDatabase: mongoose.connection.name,
    });
  for (const option of [
    { unique: true, sparse: true },
    { unique: true, partialFilterExpression: { purpose: { $type: "string" } } },
    { unique: false },
  ]) {
    try {
      await collection.insertOne({ ...row });
      await collection.createIndex(
        { booking: 1, purpose: 1 },
        { name: "payment_booking_purpose", ...option },
      );
      const data = await collection.find({}).toArray(),
        indexes = await collection.indexes();
      await assert.rejects(apply, /review/);
      assert.deepEqual(await collection.find({}).toArray(), data);
      assert.deepEqual(await collection.indexes(), indexes);
    } finally {
      await collection.drop();
    }
  }
  for (const data of [
    [{ ...row }, { ...row }],
    [{ ...row, purpose: "INVALID" }],
    [{ ...row, amount: 0 }],
  ]) {
    try {
      await collection.insertMany(data);
      const before = await collection.find({}).toArray(),
        indexes = await collection.indexes();
      await assert.rejects(apply, /Precheck/);
      assert.deepEqual(await collection.find({}).toArray(), before);
      assert.deepEqual(await collection.indexes(), indexes);
    } finally {
      await collection.drop();
    }
  }
});
