import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  paymentReadiness,
  paymentOptions,
  razorpayGateway,
} from "../src/payment-gateway.js";
const original = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env))
    if (!(k in original)) delete process.env[k];
  Object.assign(process.env, original);
});
const configuration = () => ({
  NODE_ENV: "production",
  AUTH_DELIVERY_MODE: "live",
  GHARSEVA_DEMO: "false",
  PAYMENTS_MODE: "razorpay_test",
  PAYMENT_DEPOSIT_RUPEES: "99",
  RAZORPAY_KEY_ID: "rzp_test_Fixture",
  RAZORPAY_KEY_SECRET: "fixture-private",
  RAZORPAY_WEBHOOK_SECRET: "fixture-webhook",
});
const ready = () => Object.assign(process.env, configuration());
const response = (body, ok = true) => ({ ok, json: async () => body });
test("strict readiness checks TEST mode, private keys, webhook and saved deposit without exposing values", () => {
  const valid = configuration();
  assert.equal(paymentReadiness(valid).ready, true);
  for (const invalid of [
    { PAYMENTS_MODE: "disabled" },
    { PAYMENTS_MODE: "demo" },
    { RAZORPAY_KEY_ID: "rzp_live_Fixture" },
    { RAZORPAY_KEY_SECRET: "" },
    { RAZORPAY_WEBHOOK_SECRET: "replace-me" },
    { PAYMENT_DEPOSIT_RUPEES: "1.25" },
    { PAYMENT_DEPOSIT_RUPEES: "0" },
    { GHARSEVA_DEMO: "true" },
    { AUTH_DELIVERY_MODE: "test" },
  ])
    assert.equal(
      paymentReadiness({ ...valid, ...invalid }).ready,
      false,
      JSON.stringify(Object.keys(invalid)),
    );
  ready();
  const publicOptions = JSON.stringify(paymentOptions());
  assert.ok(!publicOptions.includes(valid.RAZORPAY_KEY_SECRET));
  assert.ok(!publicOptions.includes(valid.RAZORPAY_WEBHOOK_SECRET));
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  assert.equal(paymentOptions().enabled, false);
  assert.equal(paymentOptions().mode, "razorpay_test");
});
test("adapter creates integer-paise server order with bounded timeout and refuses redirects", async () => {
  ready();
  let observed;
  const gateway = razorpayGateway(async (url, options) => {
    observed = { url, options };
    return response({ id: "order_fixture", amount: 9900, currency: "INR" });
  });
  await gateway.createOrder({
    _id: "fixture",
    amount: 9900,
    currency: "INR",
    receipt: "gsdep_fixture",
  });
  assert.equal(observed.url, "https://api.razorpay.com/v1/orders");
  assert.deepEqual(JSON.parse(observed.options.body), {
    amount: 9900,
    currency: "INR",
    receipt: "gsdep_fixture",
    partial_payment: false,
    notes: { gharseva_payment_id: "fixture" },
  });
  assert.equal(observed.options.redirect, "error");
  assert.ok(observed.options.signal instanceof AbortSignal);
});
test("provider failures, malformed JSON, timeout and connection failure remain uncertain and secret-free", async () => {
  ready();
  for (const fetcher of [
    async () => response({ error: { description: "private body" } }, false),
    async () => response({}, false),
    async () => response(null),
    async () => response([]),
    async () => response({ error: { description: "private body" } }),
    async () => ({
      ok: true,
      json: async () => {
        throw Error("private raw body");
      },
    }),
    async () => {
      throw new DOMException("private timeout", "TimeoutError");
    },
    async () => {
      throw Error("private connection details");
    },
  ]) {
    await assert.rejects(
      () => razorpayGateway(fetcher).fetchOrder("order_fixture"),
      (e) => e.status === 503 && !/private/.test(e.message),
    );
  }
});
test("receipt recovery rejects unreadable or ambiguous history instead of creating another order", async () => {
  ready();
  for (const items of [
    undefined,
    [{ receipt: "gsdep_x" }, { receipt: "gsdep_x" }],
    Array.from({ length: 100 }, () => ({ receipt: "gsdep_x" })),
  ]) {
    await assert.rejects(() =>
      razorpayGateway(async () => response({ items })).findOrder("gsdep_x"),
    );
  }
  assert.equal(
    await razorpayGateway(async () => response({ items: [] })).findOrder(
      "gsdep_x",
    ),
    null,
  );
  const order = { id: "order_fixture", receipt: "gsdep_x" };
  assert.deepEqual(
    await razorpayGateway(async () => response({ items: [order] })).findOrder(
      "gsdep_x",
    ),
    order,
  );
});

test("production deployment check uses the same TEST readiness validation", async () => {
  const { inspectEnvironment } = await import("../src/deployment.js");
  const valid = {
    ...configuration(),
    MONGODB_URI: "mongodb://127.0.0.1/gharseva_test_fixture",
    JWT_SECRET: "fixture-stable-secret-at-least-32-characters",
    IDENTITY_STORAGE_KEY: "a".repeat(64),
    CLIENT_ORIGIN: "https://fixture.example.test",
  };
  const options = { requireBuild: false };
  assert.ok(
    !inspectEnvironment(valid, options).errors.some((e) =>
      /RAZORPAY|PAYMENT_DEPOSIT/.test(e),
    ),
  );
  assert.ok(
    inspectEnvironment(
      { ...valid, RAZORPAY_WEBHOOK_SECRET: "replace-me" },
      options,
    ).errors.some((e) => /RAZORPAY_WEBHOOK_SECRET/.test(e)),
  );
  assert.ok(
    inspectEnvironment(
      { ...valid, PAYMENT_DEPOSIT_RUPEES: "1.5" },
      options,
    ).errors.some((e) => /PAYMENT_DEPOSIT/.test(e)),
  );
});
test("strict CLI validates configuration only, has truthful exit codes and exposes no private values", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const [override, expected] of [
    [{}, 0],
    [{ RAZORPAY_KEY_ID: "rzp_live_Fixture" }, 1],
    [{ RAZORPAY_WEBHOOK_SECRET: "" }, 1],
  ]) {
    const run = spawnSync(
      process.execPath,
      ["scripts/check-integrations.js", "--payments-ready"],
      {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, ...configuration(), ...override },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, expected, run.stderr);
    assert.ok(!run.stdout.includes(configuration().RAZORPAY_KEY_SECRET));
    assert.ok(!run.stdout.includes(configuration().RAZORPAY_WEBHOOK_SECRET));
    assert.ok(!run.stdout.includes(configuration().RAZORPAY_KEY_ID));
    if (expected)
      assert.match(run.stderr, /Configuration only; no gateway request/);
  }
});
