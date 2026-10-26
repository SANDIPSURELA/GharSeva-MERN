import { memoryCookie, fixtureContext } from "./session-fixture.js";
// Real handlers with mocked persistence/gateway; no MongoDB or gateway transaction.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import {
  AuthSession,
  User,
  Category,
  Settings,
  Booking,
  Payment,
  PaymentRefund,
  PaymentEvent,
} from "../src/models.js";
import { auth } from "../src/auth.js";
import { createApp, createCustomerBooking } from "../src/app.js";
import {
  mountPayments,
  mountPaymentWebhook,
  paymentContext,
  requireDepositBeforeStart,
  reconcilePayment,
} from "../src/payments.js";
import {
  paymentOptions,
  razorpayGateway,
  checkoutSignature,
} from "../src/payment-gateway.js";
import {
  paymentPlanSnapshot,
  calculateBill,
  paymentSummary,
  financialState,
} from "../src/billing-domain.js";
import { migratePaymentIndexes } from "../src/payment-indexes.js";
let tables,
  routes,
  customer,
  other,
  provider,
  admin,
  b,
  orders,
  attempts,
  refunds,
  gateway,
  createCount,
  uncertain,
  env;
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const get = (r, k) => k.split(".").reduce((v, x) => v?.[x], r);
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
function matches(r, f) {
  return Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((x) => matches(r, x));
    const value = get(r, k);
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof mongoose.Types.ObjectId) &&
      !(v instanceof Date)
    ) {
      return Object.entries(v).every(([op, x]) =>
        op === "$exists"
          ? (value !== undefined) === x
          : op === "$in"
            ? x.some((y) => same(value, y))
            : op === "$lt"
              ? value < x
              : op === "$lte"
                ? value <= x
                : op === "$ne"
                  ? !same(value, x)
                  : false,
      );
    }
    return same(value, v);
  });
}
function set(r, key, value) {
  const a = key.split(".");
  let target = r;
  for (const k of a.slice(0, -1)) target = target[k] ??= {};
  target[a.at(-1)] = clone(value);
}
function update(r, u) {
  for (const [k, v] of Object.entries(u.$set || {})) set(r, k, v);
  for (const [k, v] of Object.entries(u.$inc || {}))
    set(r, k, (get(r, k) || 0) + v);
  for (const [k, v] of Object.entries(u.$push || {}))
    set(r, k, [...(get(r, k) || []), v]);
}
function query(value) {
  let output = clone(value);
  const q = {
    then: (...args) => Promise.resolve(output).then(...args),
    lean: () => q,
    select: () => q,
    sort: () => q,
    skip: (n) => {
      if (Array.isArray(output)) output = output.slice(n);
      return q;
    },
    limit: (n) => {
      if (Array.isArray(output)) output = output.slice(0, n);
      return q;
    },
    populate: (key) => {
      const one = (r) => {
        for (const k of key.split(" "))
          if (r?.[k])
            r[k] = clone(
              tables.get(User).find((u) => same(u._id, r[k])) || r[k],
            );
        return r;
      };
      output = Array.isArray(output) ? output.map(one) : one(output);
      return q;
    },
  };
  return q;
}
function persistence(model, rows = []) {
  tables.set(model, rows);
  mock.method(model, "find", (f) => query(rows.filter((r) => matches(r, f))));
  mock.method(model, "findOne", (f) => query(rows.find((r) => matches(r, f))));
  mock.method(model, "findById", (id) =>
    query(rows.find((r) => same(r._id, id))),
  );
  mock.method(model, "exists", (f) => query(rows.some((r) => matches(r, f))));
  mock.method(
    model,
    "countDocuments",
    async (f) => rows.filter((r) => matches(r, f || {})).length,
  );
  mock.method(model, "create", async (input) => {
    const doc = new model(input);
    await doc.validate();
    const row = clone(doc.toObject());
    row.createdAt = new Date().toISOString();
    if (
      (model === Payment &&
        rows.some(
          (p) =>
            (same(p.booking, row.booking) &&
              (p.purpose || "VISIT_DEPOSIT") === row.purpose) ||
            (p.orderId && p.orderId === row.orderId) ||
            (p.paymentId && p.paymentId === row.paymentId) ||
            p.receipt === row.receipt,
        )) ||
      (model === PaymentEvent &&
        rows.some((r) => r.eventKey === row.eventKey)) ||
      (model === PaymentRefund &&
        rows.some(
          (r) => r.gatewayRefundId && r.gatewayRefundId === row.gatewayRefundId,
        ))
    )
      throw Object.assign(new Error("Duplicate"), { code: 11000 });
    rows.push(row);
    return clone(row);
  });
  mock.method(model, "findOneAndUpdate", (f, u) => {
    const r = rows.find((r) => matches(r, f));
    if (!r) return query(null);
    update(r, u);
    return query(r);
  });
  mock.method(model, "findByIdAndUpdate", (id, u) => {
    const r = rows.find((r) => same(r._id, id));
    if (!r) return query(null);
    update(r, u);
    return query(r);
  });
  mock.method(model, "updateOne", async (f, u) => {
    const r = rows.find((r) => matches(r, f));
    if (!r) return { modifiedCount: 0 };
    update(r, u);
    return { modifiedCount: 1 };
  });
}
const id = () => String(new mongoose.Types.ObjectId());
const cookie = (user) => memoryCookie(user, tables.get(AuthSession));
async function call(
  method,
  path,
  { user = customer, body = {}, params = {}, headers = {}, raw } = {},
) {
  const handlers = routes.get(method + path),
    req = {
      body: raw ?? body,
      params: { id: b._id, ...params },
      query: {},
      method: method.toUpperCase(),
      headers: {
        ...(user
          ? { cookie: cookie(user), "x-gharseva-context": fixtureContext(user) }
          : {}),
        ...headers,
      },
      get(name) {
        return this.headers[name];
      },
    };
  const out = { status: 200 },
    res = {
      status(n) {
        out.status = n;
        return this;
      },
      json(data) {
        out.data = clone(data);
        return this;
      },
    };
  try {
    for (const middleware of handlers.slice(0, -1))
      if (!middleware.resetKey && middleware.name !== "rawParser")
        await new Promise((resolve, reject) => {
          Promise.resolve(
            middleware(req, res, (e) => (e ? reject(e) : resolve())),
          ).catch(reject);
        });
    await handlers.at(-1)(req, res);
  } catch (e) {
    out.status = e.status || 500;
    out.data = { message: e.message };
  }
  return out;
}
const order = (purpose = "VISIT_DEPOSIT", extra = {}) =>
  call("post", "/api/payments/booking/:id/order", {
    body: { purpose, acceptDeposit: true, acceptBalance: true, ...extra },
  });
const record = (purpose) =>
  tables.get(Payment).find((p) => p.purpose === purpose);
const simulate = (p, outcome = "CAPTURED") =>
  call("post", "/api/payments/:id/demo", {
    params: { id: p._id },
    body: { outcome },
  });
function capture(
  p,
  {
    status = "captured",
    captured = true,
    amount = p.amount,
    currency = "INR",
    paymentId = "pay_" + p._id,
  } = {},
) {
  const s = {
    id: paymentId,
    order_id: p.orderId,
    amount,
    currency,
    status,
    captured,
    amount_refunded: 0,
    method: "upi",
  };
  attempts.set(p.orderId, [s]);
  orders.get(p.orderId).status =
    captured && ["captured", "refunded"].includes(status)
      ? "paid"
      : "attempted";
  return s;
}
const verify = (p) => {
  const s = attempts.get(p.orderId)[0];
  return call("post", "/api/payments/:id/verify", {
    params: { id: p._id },
    body: {
      razorpay_order_id: p.orderId,
      razorpay_payment_id: s.id,
      razorpay_signature: checkoutSignature(p.orderId, s.id),
    },
  });
};
async function bill({
  items = [
    {
      kind: "SERVICE",
      label: "Service charge",
      quantity: 1,
      unitAmount: 29900,
    },
  ],
  requestId = "bill-request-0001",
} = {}) {
  return call("post", "/api/payments/booking/:id/bill", {
    user: provider,
    body: { items, requestId },
  });
}
const approve = (version) =>
  call("post", "/api/payments/booking/:id/bill/decision", {
    body: { version, decision: "APPROVED", confirm: true },
  });
async function readyForBill() {
  await order();
  await simulate(record("VISIT_DEPOSIT"));
  b.status = "COMPLETED";
}
beforeEach(() => {
  env = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_DELIVERY_MODE: "test",
    GHARSEVA_DEMO: "true",
    PAYMENTS_MODE: "demo",
    JWT_SECRET: "payment-unit-only-not-a-real-key",
  });
  tables = new Map();
  routes = new Map();
  orders = new Map();
  attempts = new Map();
  refunds = new Map();
  createCount = 0;
  uncertain = false;
  customer = {
    _id: id(),
    name: "Fixture customer",
    role: "customer",
    status: "ACTIVE",
    sessionVersion: 0,
  };
  other = { ...customer, _id: id() };
  provider = {
    _id: id(),
    name: "Fixture provider",
    role: "provider",
    status: "ACTIVE",
    profile: { status: "APPROVED" },
  };
  admin = { _id: id(), name: "Fixture admin", role: "admin", status: "ACTIVE" };
  persistence(User, [customer, other, provider, admin]);
  b = {
    _id: id(),
    customer: customer._id,
    provider: provider._id,
    status: "ACCEPTED",
    service: "Plumbing",
    price: 299,
    date: "2026-11-20",
    time: "09:00",
    address: "Fixture address only",
    active: true,
    visitCode: "123456",
    otpAttempts: 0,
    timeline: [],
    paymentPlan: paymentPlanSnapshot(299),
  };
  persistence(Booking, [b]);
  for (const m of [AuthSession, Payment, PaymentRefund, PaymentEvent])
    persistence(m);
  mock.method(Payment.collection, "indexes", async () => [
    { name: "_id_", key: { _id: 1 }, unique: true },
    {
      name: "payment_booking_purpose",
      key: { booking: 1, purpose: 1 },
      unique: true,
    },
  ]);
  gateway = {
    createOrder: async (p) => {
      createCount++;
      const o = {
        id: "order_" + p._id,
        amount: p.amount,
        currency: "INR",
        receipt: p.receipt,
        status: "created",
      };
      orders.set(o.id, o);
      attempts.set(o.id, []);
      if (uncertain)
        throw Object.assign(new Error("Uncertain create"), { status: 503 });
      return clone(o);
    },
    fetchOrder: async (key) => clone(orders.get(key)),
    findOrder: async (receipt) =>
      clone([...orders.values()].find((o) => o.receipt === receipt)),
    orderPayments: async (key) => clone(attempts.get(key) || []),
    fetchPayment: async (key) =>
      clone([...attempts.values()].flat().find((s) => s.id === key)),
    paymentRefunds: async (key) => clone(refunds.get(key) || []),
  };
  const app = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (path, ...handlers) =>
          routes.set(method + path, handlers),
    },
  );
  mountPaymentWebhook(app, { gateway });
  mountPayments(app, { gateway });
});
afterEach(() => {
  mock.restoreAll();
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
});
function testMode() {
  Object.assign(process.env, {
    PAYMENTS_MODE: "razorpay_test",
    RAZORPAY_KEY_ID: "rzp_test_Fixture",
    RAZORPAY_KEY_SECRET: "fixture-secret",
    RAZORPAY_WEBHOOK_SECRET: "fixture-hook-secret",
  });
  b.paymentPlan = paymentPlanSnapshot(b.price);
}

test("new plan snapshots capped default deposit and historical bookings do not acquire requirements", async () => {
  assert.equal(b.paymentPlan.depositAmount, 9900);
  assert.equal(paymentPlanSnapshot(40).depositAmount, 4000);
  assert.equal(paymentPlanSnapshot(299, { mode: "disabled" }), undefined);
  const saved = clone(b.paymentPlan);
  process.env.PAYMENT_DEPOSIT_RUPEES = "150";
  assert.deepEqual(b.paymentPlan, saved);
  const history = { ...b, paymentPlan: undefined };
  await requireDepositBeforeStart(history, { gateway });
  await assert.rejects(
    () => requireDepositBeforeStart(b, { gateway }),
    /captured deposit/,
  );
});
test("only owning customers can pay accepted bookings; payment outcomes never cancel service", async () => {
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/order", {
        user: null,
        body: { acceptDeposit: true },
      })
    ).status,
    401,
  );
  for (const user of [provider, admin])
    assert.equal(
      (
        await call("post", "/api/payments/booking/:id/order", {
          user,
          body: { acceptDeposit: true },
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/order", {
        user: other,
        body: { acceptDeposit: true },
      })
    ).status,
    404,
  );
  b.status = "PENDING";
  assert.equal((await order()).status, 409);
  b.status = "ACCEPTED";
  assert.equal(
    (
      await order("VISIT_DEPOSIT", {
        amount: 1,
        currency: "USD",
        customer: other._id,
      })
    ).status,
    200,
  );
  assert.equal(record("VISIT_DEPOSIT").amount, 9900);
  await simulate(record("VISIT_DEPOSIT"), "FAILED");
  await simulate(record("VISIT_DEPOSIT"), "CANCELLED");
  assert.equal(b.status, "ACCEPTED");
  await assert.rejects(() => requireDepositBeforeStart(b, { gateway }));
  await simulate(record("VISIT_DEPOSIT"));
  await requireDepositBeforeStart(b, { gateway });
  assert.equal(b.status, "ACCEPTED");
});
test("actual visit transition keeps OTP and requires captured deposit only on new plan", async () => {
  b.status = "ON_THE_WAY";
  const app = createApp({ paymentGateway: gateway }),
    handler = app.router.stack
      .find((l) => l.route?.path === "/api/bookings/:id/status")
      .route.stack.at(-1).handle;
  const invoke = async (code) => {
    try {
      await handler(
        {
          params: { id: b._id },
          body: { status: "IN_PROGRESS", code },
          user: provider,
        },
        { json: () => {} },
      );
      return 200;
    } catch (e) {
      return e.status || 500;
    }
  };
  assert.equal(await invoke("123456"), 409);
  await order();
  await simulate(record("VISIT_DEPOSIT"));
  assert.equal(await invoke("000000"), 400);
  assert.equal(b.status, "ON_THE_WAY");
  assert.equal(await invoke("123456"), 200);
  assert.equal(b.status, "IN_PROGRESS");
  b.status = "ON_THE_WAY";
  b.visitCode = "123456";
  delete b.paymentPlan;
  tables.get(Payment).length = 0;
  assert.equal(await invoke("123456"), 200);
});
test("unapproved extras and invented totals are rejected; amounts are integer paise", async () => {
  b.status = "COMPLETED";
  assert.equal(
    (
      await bill({
        items: [
          {
            kind: "SERVICE",
            label: "Service",
            quantity: 1,
            unitAmount: 29900.1,
          },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await bill({ items: [{ kind: "EXTRA", extraId: "forged" }] })).status,
    400,
  );
  assert.equal(
    (
      await bill({
        items: [
          {
            kind: "SERVICE",
            label: "Hidden extras",
            quantity: 1,
            unitAmount: 30000,
          },
        ],
      })
    ).status,
    400,
  );
  const r = await call("post", "/api/payments/booking/:id/bill", {
    user: provider,
    body: {
      requestId: "bill-request-001",
      total: 1,
      items: [
        {
          kind: "SERVICE",
          label: "Actual charge",
          quantity: 2,
          unitAmount: 10000,
        },
      ],
    },
  });
  assert.equal(r.data.bill.total, 20000);
});
test("extra approval belongs to the customer and final bill uses immutable approved values once", async () => {
  const e = await call("post", "/api/payments/booking/:id/extras", {
    user: provider,
    body: {
      label: "Replacement part",
      kind: "MATERIAL",
      quantity: 2,
      unitAmount: 5000,
    },
  });
  assert.equal(e.status, 201);
  const decide = (user) =>
    call("post", "/api/payments/booking/:id/extras/:extraId/decision", {
      user,
      params: { extraId: e.data.extra.id },
      body: { decision: "APPROVED", amount: 1 },
    });
  assert.equal((await decide(provider)).status, 403);
  assert.equal((await decide(other)).status, 404);
  assert.equal((await decide(customer)).status, 200);
  b.status = "COMPLETED";
  const items = [
    { kind: "SERVICE", label: "Base", quantity: 1, unitAmount: 29900 },
    { kind: "EXTRA", extraId: e.data.extra.id, amount: 1, unitAmount: 1 },
  ];
  let r = await bill({ items });
  assert.equal(r.data.bill.total, 39900);
  assert.equal(r.data.bill.items[1].amount, 10000);
  assert.equal(
    (await bill({ items: [...items, items[1]], requestId: "another-bill-000" }))
      .status,
    400,
  );
});
test("bill ownership, corrections, version history and customer approval are enforced", async () => {
  await readyForBill();
  const r = await bill();
  assert.equal(r.status, 201);
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/bill", {
        user: customer,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/bill/decision", {
        user: provider,
        body: { version: 1, decision: "APPROVED", confirm: true },
      })
    ).status,
    403,
  );
  assert.equal((await order("FINAL_BALANCE")).status, 409);
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/bill/decision", {
        body: { version: 1, decision: "APPROVED" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/bill/decision", {
        body: {
          version: 1,
          decision: "CORRECTION_REQUESTED",
          reason: "Please remove duplicate labour.",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await bill({
        requestId: "revised-bill-0002",
        items: [
          {
            kind: "SERVICE",
            label: "Corrected charge",
            quantity: 1,
            unitAmount: 25000,
          },
        ],
      })
    ).status,
    201,
  );
  assert.equal((await approve(1)).status, 409);
  assert.equal((await approve(2)).status, 200);
  assert.equal(b.billing.versions.length, 2);
  assert.match(b.billing.versions[0].correctionReason, /duplicate/);
});
test("deposit is deducted once, separate balance order is frozen, and retries settle one request", async () => {
  await readyForBill();
  await bill();
  await approve(1);
  const r = await order("FINAL_BALANCE", { amount: 29900, billVersion: 99 });
  assert.equal(r.status, 200);
  assert.equal(r.data.payment.amount, 20000);
  assert.equal(r.data.payment.billVersion, 1);
  assert.notEqual(r.data.payment.orderId, record("VISIT_DEPOSIT").orderId);
  assert.equal(tables.get(Payment).length, 2);
  const again = await order("FINAL_BALANCE");
  assert.equal(again.data.payment._id, r.data.payment._id);
  assert.equal(
    (
      await call("post", "/api/payments/booking/:id/bill/decision", {
        body: {
          version: 1,
          decision: "CORRECTION_REQUESTED",
          reason: "Change after checkout",
        },
      })
    ).status,
    409,
  );
  await simulate(record("FINAL_BALANCE"));
  let c = await paymentContext(b._id, customer);
  assert.equal(c.summary.grossCaptured, 29900);
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.settled, true);
  assert.equal(c.summary.payoutStatus, "NOT_INITIATED");
  assert.equal(b.status, "COMPLETED");
});
test("zero due creates no balance order, and overpayment creates refund review", async () => {
  await readyForBill();
  await bill({
    items: [
      { kind: "SERVICE", label: "Visit only", quantity: 1, unitAmount: 9900 },
    ],
  });
  await approve(1);
  let r = await order("FINAL_BALANCE");
  assert.equal(r.status, 200);
  assert.equal(r.data.checkoutReady, false);
  assert.equal(tables.get(Payment).length, 1);
  assert.equal(b.billing.settledTotal, 9900);
  const over = {
    ...b,
    billing: {
      revision: 0,
      version: 1,
      extras: [],
      versions: [{ version: 1, total: 5000, status: "APPROVED" }],
    },
  };
  const s = paymentSummary(over, tables.get(Payment));
  assert.equal(s.overpayment, 4900);
  assert.equal(s.remaining, 0);
  assert.equal(s.state, "REFUND_REVIEW");
});
test("mocked Razorpay orders, uncertain creates and concurrent callbacks cannot create duplicate collection", async () => {
  testMode();
  uncertain = true;
  assert.equal((await order()).status, 503);
  let p = record("VISIT_DEPOSIT");
  assert.equal(createCount, 1);
  uncertain = false;
  const resumed = await order();
  assert.equal(resumed.status, 200);
  assert.equal(createCount, 1);
  p = record("VISIT_DEPOSIT");
  capture(p);
  const rs = await Promise.all([verify(p), verify(p), verify(p)]);
  assert.ok(
    rs.every((r) => r.status === 200),
    JSON.stringify(rs),
  );
  assert.equal(record("VISIT_DEPOSIT").capturedAmount, 9900);
  assert.equal(tables.get(Payment).length, 1);
});
test("authorized and forged gateway signatures/amounts/order references cannot satisfy the deposit", async () => {
  testMode();
  await order();
  let p = record("VISIT_DEPOSIT");
  capture(p, { status: "authorized", captured: false });
  assert.equal((await verify(p)).data.payment.status, "AUTHORIZED");
  await assert.rejects(() => requireDepositBeforeStart(b, { gateway }));
  assert.equal(
    (
      await call("post", "/api/payments/:id/verify", {
        params: { id: p._id },
        body: {
          razorpay_order_id: p.orderId,
          razorpay_payment_id: "pay_forged123",
          razorpay_signature: "0".repeat(64),
        },
      })
    ).status,
    400,
  );
  capture(p, { amount: 1 });
  assert.equal((await verify(p)).status, 409);
  capture(p, { currency: "USD" });
  assert.equal((await verify(p)).status, 409);
  capture(p);
  orders.get(p.orderId).receipt = "foreign";
  assert.equal((await verify(p)).status, 409);
  assert.equal(record("VISIT_DEPOSIT").status, "AUTHORIZED");
});
test("raw-signed webhooks are idempotent, out-of-order payload flags are not trusted", async () => {
  testMode();
  await order();
  const p = record("VISIT_DEPOSIT"),
    snapshot = capture(p),
    payload = {
      event: "payment.captured",
      payload: { payment: { entity: { id: snapshot.id } } },
    },
    raw = Buffer.from(JSON.stringify(payload)),
    signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(raw)
      .digest("hex");
  const hook = (rawBody = raw, sig = signature) =>
    call("post", "/api/payments/webhook", {
      user: null,
      raw: rawBody,
      headers: {
        "X-Razorpay-Signature": sig,
        "X-Razorpay-Event-Id": "event-fixture-001",
      },
    });
  assert.equal((await hook(raw, "0".repeat(64))).status, 401);
  assert.equal((await hook()).status, 200);
  assert.equal((await hook()).data.duplicate, true);
  assert.equal(record("VISIT_DEPOSIT").capturedAmount, 9900);
  const changed = Buffer.from(
    JSON.stringify({ ...payload, event: "payment.failed" }),
  );
  assert.equal(
    (
      await hook(
        changed,
        createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
          .update(changed)
          .digest("hex"),
      )
    ).status,
    409,
  );
});
test("pending refunds do not count as processed and partial/full reconciliation is monotonic", async () => {
  testMode();
  await order();
  let p = record("VISIT_DEPOSIT"),
    s = capture(p);
  await verify(p);
  refunds.set(s.id, [
    {
      id: "rfnd_fixture01",
      payment_id: s.id,
      currency: "INR",
      amount: 4000,
      status: "pending",
    },
  ]);
  s.amount_refunded = 4000;
  await reconcilePayment(p, gateway);
  p = record("VISIT_DEPOSIT");
  assert.equal(p.refundedAmount, 0);
  assert.equal(p.refundPending, true);
  await assert.rejects(() => requireDepositBeforeStart(b, { gateway }));
  refunds.get(s.id)[0].status = "processed";
  await reconcilePayment(p, gateway);
  p = record("VISIT_DEPOSIT");
  assert.equal(p.refundedAmount, 4000);
  assert.equal(p.status, "PARTIALLY_REFUNDED");
  refunds.get(s.id).push({
    id: "rfnd_fixture02",
    payment_id: s.id,
    currency: "INR",
    amount: 5900,
    status: "processed",
  });
  s.amount_refunded = 9900;
  s.status = "refunded";
  await reconcilePayment(p, gateway);
  assert.equal(record("VISIT_DEPOSIT").refundedAmount, 9900);
  assert.equal(tables.get(PaymentRefund).length, 2);
});
test("cancellation preserves captures and requests never claim money returned", async () => {
  await order();
  await simulate(record("VISIT_DEPOSIT"));
  b.status = "CANCELLED";
  b.active = false;
  let c = await paymentContext(b._id, customer);
  assert.equal(c.summary.refundReview, true);
  assert.equal(c.payment.status, "CAPTURED");
  assert.equal((await order()).status, 409);
  const request = await call("post", "/api/payments/:id/refund-review", {
    params: { id: record("VISIT_DEPOSIT")._id },
    body: {
      amount: 9900,
      reason: "Service cancelled before visit",
      requestId: "refund-review-001",
    },
  });
  assert.equal(request.status, 201);
  assert.equal(record("VISIT_DEPOSIT").refundedAmount, 0);
  assert.equal(
    (await paymentContext(b._id, customer)).summary.pendingRefund,
    true,
  );
});
test("post-settlement refund is separate, cannot exceed capture, and creates no new debt", async () => {
  await readyForBill();
  await bill();
  await approve(1);
  await order("FINAL_BALANCE");
  await simulate(record("FINAL_BALANCE"));
  const p = record("FINAL_BALANCE");
  assert.equal(
    (
      await call("post", "/api/payments/:id/demo-refund", {
        user: admin,
        params: { id: p._id },
        body: { confirm: true, amount: 25000, requestId: "too-large-refund" },
      })
    ).status,
    409,
  );
  const body = { confirm: true, amount: 5000, requestId: "partial-refund-001" };
  assert.equal(
    (
      await call("post", "/api/payments/:id/demo-refund", {
        user: admin,
        params: { id: p._id },
        body,
      })
    ).status,
    200,
  );
  await call("post", "/api/payments/:id/demo-refund", {
    user: admin,
    params: { id: p._id },
    body,
  });
  const c = await paymentContext(b._id, customer);
  assert.equal(c.summary.processedRefunds, 5000);
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.state, "REFUND_REVIEW");
  assert.equal(tables.get(PaymentRefund).length, 1);
  assert.equal((await order("FINAL_BALANCE")).data.checkoutReady, false);
});
test("competing bill approval/order and refund submissions cannot over-collect/refund", async () => {
  await readyForBill();
  await bill();
  await approve(1);
  const rs = await Promise.all([
    order("FINAL_BALANCE"),
    order("FINAL_BALANCE"),
  ]);
  assert.ok(rs.some((r) => r.status === 200));
  assert.equal(
    tables.get(Payment).filter((p) => p.purpose === "FINAL_BALANCE").length,
    1,
  );
  assert.equal(
    (
      await call("post", "/api/payments/:id/refund-review", {
        params: { id: record("VISIT_DEPOSIT")._id },
        body: {
          amount: 100,
          reason: "Conflicting refund request",
          requestId: "conflict-review-01",
        },
      })
    ).status,
    409,
  );
});
test("live keys and production simulation are refused; no automatic provider payout exists", () => {
  process.env.NODE_ENV = "production";
  assert.equal(paymentOptions().enabled, false);
  testMode();
  process.env.RAZORPAY_KEY_ID = "rzp_live_Forbidden";
  assert.equal(paymentOptions().enabled, false);
  assert.equal(paymentSummary(b, []).payoutStatus, "NOT_INITIATED");
});
test("safe migration prechecks, dry-run and repeat apply preserve exact historical receipt data", async () => {
  const row = {
      _id: id(),
      booking: id(),
      customer: id(),
      provider: id(),
      mode: "demo",
      amount: 9900,
      currency: "INR",
      receipt: "legacy-receipt",
      history: [{ action: "CAPTURED" }],
    },
    rows = [clone(row)];
  let indexes = [
      { name: "_id_", key: { _id: 1 }, unique: true },
      { name: "booking_1", key: { booking: 1 }, unique: true },
    ],
    drops = [];
  const collection = {
    collectionName: "temporary-fixture",
    dbName: "migration_fixture",
    indexes: async () => clone(indexes),
    find: () => ({ toArray: async () => clone(rows) }),
    updateMany: async () => {
      for (const r of rows) if (r.purpose == null) r.purpose = "VISIT_DEPOSIT";
    },
    createIndex: async (key, o) => {
      if (!indexes.some((i) => i.name === o.name))
        indexes.push({ name: o.name, key, ...o });
    },
    dropIndex: async (name) => {
      drops.push(name);
      indexes = indexes.filter((i) => i.name !== name);
    },
  };
  const dry = await migratePaymentIndexes(collection);
  assert.equal(dry.backfill, 1);
  assert.deepEqual(rows, [row]);
  assert.deepEqual(drops, []);
  await migratePaymentIndexes(collection, {
    apply: true,
    confirmedDatabase: "migration_fixture",
  });
  await migratePaymentIndexes(collection, {
    apply: true,
    confirmedDatabase: "migration_fixture",
  });
  assert.deepEqual(rows, [{ ...row, purpose: "VISIT_DEPOSIT" }]);
  assert.deepEqual(drops, ["booking_1"]);
  rows.push({ ...row, _id: id() });
  await assert.rejects(
    () =>
      migratePaymentIndexes(collection, {
        apply: true,
        confirmedDatabase: "migration_fixture",
      }),
    /Precheck/,
  );
  assert.deepEqual(drops, ["booking_1"]);
});
test("interrupted simulated refund reconciles on refresh and competing requests cannot exceed capture", async () => {
  await order();
  await simulate(record("VISIT_DEPOSIT"));
  const p = record("VISIT_DEPOSIT");
  const result = await call("post", "/api/payments/:id/demo-refund", {
    user: admin,
    params: { id: p._id },
    body: { confirm: true, amount: 2000, requestId: "interrupted-0001" },
  });
  assert.equal(result.status, 200);
  p.refundedAmount = 0;
  p.status = "CAPTURED"; // interruption after refund record, before ledger write
  b.billing.demoRefunds[0].status = "RESERVED";
  const recovered = await call("post", "/api/payments/booking/:id/refresh", {
    body: {},
  });
  assert.equal(recovered.status, 200);
  assert.equal(p.refundedAmount, 2000);
  assert.equal(b.billing.demoRefunds[0].status, "DONE");
  const requests = await Promise.all(
    ["concurrent-00001", "concurrent-00002"].map((requestId) =>
      call("post", "/api/payments/:id/demo-refund", {
        user: admin,
        params: { id: p._id },
        body: { confirm: true, amount: 6000, requestId },
      }),
    ),
  );
  assert.equal(requests.filter((r) => r.status === 200).length, 1);
  assert.equal(p.refundedAmount, 8000);
  assert.equal(
    tables.get(PaymentRefund).reduce((n, r) => n + r.amount, 0),
    8000,
  );
});

test("changed payment credits require fresh approval and an outstanding order blocks further collection", async () => {
  testMode();
  await order();
  const d = record("VISIT_DEPOSIT"),
    s = capture(d);
  await verify(d);
  b.status = "COMPLETED";
  await bill();
  await approve(1);
  const refund = {
    id: "rfnd_Change0001",
    payment_id: s.id,
    amount: 1000,
    currency: "INR",
    status: "processed",
  };
  refunds.set(s.id, [refund]);
  s.amount_refunded = 1000;
  const changed = await order("FINAL_BALANCE");
  assert.equal(changed.status, 409);
  assert.match(changed.data.message, /credits changed/);
  assert.equal(record("FINAL_BALANCE"), undefined);
  assert.equal((await approve(1)).status, 200);
  assert.equal((await order("FINAL_BALANCE")).data.payment.amount, 21000);
  refunds.get(s.id).push({ ...refund, id: "rfnd_Change0002", amount: 1000 });
  s.amount_refunded = 2000;
  assert.equal((await order("FINAL_BALANCE")).status, 409);
  assert.equal(createCount, 2);
});

test("legacy unique booking index blocks balance before freezing or creating another record", async () => {
  await readyForBill();
  await bill();
  await approve(1);
  mock.method(Payment.collection, "indexes", async () => [
    { name: "booking_1", key: { booking: 1 }, unique: true },
  ]);
  const r = await order("FINAL_BALANCE");
  assert.equal(r.status, 503);
  assert.match(r.data.message, /migration|upgrade/i);
  assert.equal(b.billing.balancePayment, undefined);
  assert.equal(tables.get(Payment).length, 1);
});

test("overpayment is blocked from checkout and does not produce a negative balance", async () => {
  await readyForBill();
  await bill({
    items: [
      {
        kind: "SERVICE",
        label: "Reduced actual charge",
        quantity: 1,
        unitAmount: 5000,
      },
    ],
  });
  await approve(1);
  const r = await order("FINAL_BALANCE");
  assert.equal(r.status, 409);
  const c = await paymentContext(b._id, customer);
  assert.equal(c.summary.overpayment, 4900);
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.state, "REFUND_REVIEW");
  assert.equal(tables.get(Payment).length, 1);
});

test("Razorpay HTTP adapter sends separate paise orders and validates reference paths without network access", async () => {
  testMode();
  const seen = [];
  const adapter = razorpayGateway(async (url, options) => {
    seen.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: "order_Adapter0001", items: [] }),
    };
  });
  for (const [amount, receipt] of [
    [9900, "deposit_fixture"],
    [20000, "balance_fixture"],
  ])
    await adapter.createOrder({
      _id: receipt,
      amount,
      currency: "INR",
      receipt,
    });
  assert.deepEqual(
    seen.map((s) => JSON.parse(s.options.body).amount),
    [9900, 20000],
  );
  assert.ok(seen.every((s) => s.url === "https://api.razorpay.com/v1/orders"));
  await adapter.fetchOrder("order_Adapter0001");
  await adapter.paymentRefunds("pay_Adapter0001");
  assert.match(seen[3].url, /refunds\?count=100&skip=0$/);
  assert.throws(
    () => adapter.fetchOrder("https://evil.example"),
    /Invalid gateway reference/,
  );
  process.env.RAZORPAY_KEY_ID = "rzp_live_Refused";
  await assert.rejects(
    () => adapter.createOrder({ _id: "denied", amount: 1, currency: "INR" }),
    /Live keys are not accepted/,
  );
  assert.equal(seen.length, 4);
});
test("ordinary booking handler snapshots authoritative capped plan and ignores forged browser financial fields", async () => {
  Object.assign(provider.profile, {
    category: "plumbing",
    city: "Ahmedabad",
    city: "Ahmedabad",
    price: 100,
    available: true,
    days: [0, 1, 2, 3, 4, 5, 6],
    slots: ["10:00"],
  });
  persistence(Category, [
    { _id: id(), slug: "plumbing", name: "Plumbing", enabled: true },
  ]);
  mock.method(Settings, "findOneAndUpdate", () =>
    query({ bookingEnabled: true }),
  );
  process.env.PAYMENT_DEPOSIT_RUPEES = "150";
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const input = {
    providerId: provider._id,
    city: "Ahmedabad",
    city: "Ahmedabad",
    category: "plumbing",
    date,
    time: "10:00",
    address: "42 Fictional Lane, Ahmedabad",
    price: 1,
    status: "COMPLETED",
    customer: other._id,
    paymentPlan: { depositAmount: 1, mode: "live" },
    billing: { settledAt: new Date().toISOString() },
  };
  const created = await createCustomerBooking(customer, input);
  assert.equal(created.status, "PENDING");
  assert.equal(created.price, 100);
  assert.equal(created.paymentPlan.depositAmount, 10000);
  assert.equal(created.paymentPlan.mode, "demo");
  assert.equal(created.customer._id, customer._id);
  assert.equal(created.billing, undefined);
  process.env.PAYMENTS_MODE = "disabled";
  const ordinary = await createCustomerBooking(customer, {
    ...input,
    time: "10:00",
  });
  assert.equal(ordinary.paymentPlan, undefined);
  assert.equal(ordinary.status, "PENDING");
});

test("mocked gateway deposit and balance reconcile to one settlement under concurrent callbacks", async () => {
  testMode();
  await order();
  const d = record("VISIT_DEPOSIT");
  capture(d);
  assert.equal((await verify(d)).status, 200);
  b.status = "COMPLETED";
  await bill();
  await approve(1);
  const o = await order("FINAL_BALANCE");
  assert.equal(o.status, 200);
  const p = record("FINAL_BALANCE");
  assert.equal(p.amount, 20000);
  assert.notEqual(p.orderId, d.orderId);
  capture(p);
  const callbacks = await Promise.all([verify(p), verify(p)]);
  assert.ok(callbacks.every((r) => r.status === 200));
  const c = await paymentContext(b._id, customer);
  assert.equal(c.summary.grossCaptured, 29900);
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.settled, true);
  assert.equal(c.summary.payoutStatus, "NOT_INITIATED");
  assert.equal(p.history.filter((h) => h.action === "CAPTURED").length, 1);
  assert.equal(createCount, 2);
});

test("competing approval and correction cannot both mutate the same submitted bill", async () => {
  await readyForBill();
  await bill();
  const outcomes = await Promise.all([
    approve(1),
    call("post", "/api/payments/booking/:id/bill/decision", {
      body: {
        version: 1,
        decision: "CORRECTION_REQUESTED",
        reason: "Please review this amount again",
      },
    }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 200).length, 1);
  assert.equal(outcomes.filter((r) => r.status === 409).length, 1);
  assert.equal(b.billing.versions.length, 1);
  assert.equal(b.billing.versions[0].history.length, 2);
});
test("a refund discovered with the first balance-capture callback does not create new debt", async () => {
  testMode();
  await order();
  const d = record("VISIT_DEPOSIT");
  capture(d);
  await verify(d);
  b.status = "COMPLETED";
  await bill();
  await approve(1);
  await order("FINAL_BALANCE");
  const p = record("FINAL_BALANCE"),
    s = capture(p);
  s.amount_refunded = 1000;
  refunds.set(s.id, [
    {
      id: "rfnd_Delayed0001",
      payment_id: s.id,
      amount: 1000,
      currency: "INR",
      status: "processed",
    },
  ]);
  assert.equal((await verify(p)).status, 200);
  const c = await paymentContext(b._id, customer);
  assert.equal(c.summary.grossCaptured, 29900);
  assert.equal(c.summary.processedRefunds, 1000);
  assert.equal(c.summary.remaining, 0);
  assert.equal(c.summary.settled, true);
  assert.equal(c.summary.state, "SETTLED");
  assert.equal(b.billing.settledCredits, 29900);
  assert.equal(c.canBalance, false);
  assert.equal(createCount, 2);
});
