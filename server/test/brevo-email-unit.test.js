import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import {
  deliverCode,
  identityOptions,
  emailReadiness,
} from "../src/identity-services.js";
import { verificationAvailability } from "../../shared/verification-options.js";
import { inspectEnvironment } from "../src/deployment.js";

const saved = { ...process.env };
const brevo = {
  NODE_ENV: "test",
  AUTH_DELIVERY_MODE: "live",
  GHARSEVA_DEMO: "false",
  EMAIL_TRANSPORT: "brevo",
  BREVO_API_KEY: "fixture-api-key-no-real-account",
  EMAIL_FROM_ADDRESS: "sender@example.test",
  EMAIL_FROM_NAME: "GharSeva",
};
function configure() {
  for (const k of Object.keys(process.env))
    if (/^(SMTP_|TWILIO_|FIREBASE_|AUTH_GOOGLE|AUTH_APPLE)/.test(k))
      delete process.env[k];
  Object.assign(process.env, brevo);
}
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
test("Brevo email readiness needs no SMTP, SMS or social credentials; public options contain no provider secrets", () => {
  configure();
  assert.equal(emailReadiness().ready, true);
  const o = identityOptions();
  assert.equal(o.email, true);
  for (const key of ["demo", "mobile", "google", "apple"])
    assert.equal(o[key], false);
  const json = JSON.stringify(o);
  for (const secret of [
    brevo.BREVO_API_KEY,
    brevo.EMAIL_FROM_ADDRESS,
    "BREVO",
    "transport",
  ])
    assert.ok(!json.includes(secret));
  const warnings = inspectEnvironment(
    { ...process.env, NODE_ENV: "production" },
    { requireBuild: false },
  ).warnings;
  assert.ok(!warnings.some((w) => /Email verification/.test(w)));
});
test("selected transport refuses missing, malformed, placeholder or contradictory live settings", async () => {
  configure();
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
    throw Error("must not connect");
  });
  for (const [key, value] of [
    ["EMAIL_TRANSPORT", "other"],
    ["EMAIL_TRANSPORT", ""],
    ["BREVO_API_KEY", ""],
    ["BREVO_API_KEY", "key\nprivate"],
    ["BREVO_API_KEY", "replace_this_with_api_key"],
    ["EMAIL_FROM_ADDRESS", ""],
    ["EMAIL_FROM_ADDRESS", "Name <s@example.test>"],
    ["EMAIL_FROM_ADDRESS", "a@example.test,b@example.test"],
    ["EMAIL_FROM_ADDRESS", "a@example.test\r\nbcc: x"],
    ["EMAIL_FROM_NAME", "name\nother"],
    ["EMAIL_FROM_NAME", ""],
    ["AUTH_DELIVERY_MODE", "test"],
    ["GHARSEVA_DEMO", "true"],
  ]) {
    Object.assign(process.env, brevo, { [key]: value });
    assert.equal(identityOptions().email, false, key);
    await assert.rejects(
      () => deliverCode("email", "owner@example.test", "123456", "login"),
      { status: 503 },
    );
    assert.ok(!JSON.stringify(emailReadiness()).includes("key\nprivate"));
  }
  assert.equal(calls, 0);
  Object.assign(process.env, brevo);
  delete process.env.EMAIL_TRANSPORT;
  assert.equal(emailReadiness().transport, "smtp");
  assert.equal(emailReadiness().ready, false);
});
test("Brevo uses documented fixed HTTPS request and a single intended recipient for all numeric OTP purposes", async () => {
  configure();
  const calls = [],
    logs = [];
  for (const method of ["log", "warn", "error"])
    mock.method(console, method, (...args) => logs.push(args));
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      { messageId: "<fixture@brevo.test>" },
      { status: 201 },
    );
  });
  mock.method(nodemailer, "createTransport", () => {
    throw Error("no SMTP fallback");
  });
  for (const purpose of [
    "register",
    "login",
    "recover",
    "verify",
    "admin_reauth",
  ]) {
    assert.equal(
      await deliverCode("email", "owner@example.test", "123456", purpose),
      undefined,
    );
    const { url, init } = calls.at(-1),
      body = JSON.parse(init.body);
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers["api-key"], brevo.BREVO_API_KEY);
    assert.deepEqual(body.sender, {
      name: "GharSeva",
      email: brevo.EMAIL_FROM_ADDRESS,
    });
    assert.deepEqual(body.to, [{ email: "owner@example.test" }]);
    assert.match(body.textContent, /123456/);
    assert.equal(body.htmlContent, undefined);
  }
  assert.equal(calls.length, 5);
  assert.deepEqual(logs, []);
});
test("Brevo rejects non-2xx, 429, malformed JSON, empty/explicit rejection responses without retry or leakage", async () => {
  configure();
  let calls = 0,
    smtp = 0;
  mock.method(nodemailer, "createTransport", () => {
    smtp++;
  });
  const responses = [
    () =>
      Response.json(
        { message: "private 123456 " + brevo.BREVO_API_KEY },
        { status: 400 },
      ),
    () => Response.json({ code: "unauthorized" }, { status: 401 }),
    () =>
      Response.json(
        { code: "too_many_requests" },
        { status: 429, headers: { "retry-after": "60" } },
      ),
    () => Response.json({}, { status: 503 }),
    () => new Response("invalid private 123456", { status: 201 }),
    () => Response.json({}, { status: 201 }),
    () => Response.json(null, { status: 201 }),
    () => Response.json({ messageId: "" }, { status: 201 }),
    () => Response.json({ messageId: "id", code: "rejected" }, { status: 200 }),
    () => Response.json({ error: "private" }, { status: 200 }),
  ];
  for (const response of responses) {
    mock.method(globalThis, "fetch", async () => {
      calls++;
      return response();
    });
    await assert.rejects(
      () => deliverCode("email", "owner@example.test", "123456", "login"),
      (e) => e.status === 503 && !/private|123456|fixture/.test(e.message),
    );
  }
  assert.equal(calls, responses.length);
  assert.equal(smtp, 0);
});
test("connection failure and bounded timeout fail safely, including a timeout while reading the response body", async () => {
  configure();
  let calls = 0,
    timeout;
  mock.method(AbortSignal, "timeout", (ms) => {
    timeout = ms;
    return new AbortController().signal;
  });
  for (const problem of [
    Error("connection private"),
    new DOMException("timeout private", "TimeoutError"),
  ]) {
    mock.method(globalThis, "fetch", async () => {
      calls++;
      throw problem;
    });
    await assert.rejects(
      () => deliverCode("email", "owner@example.test", "123456", "login"),
      { status: 503 },
    );
  }
  mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => {
      calls++;
      throw new DOMException("private", "TimeoutError");
    },
  }));
  await assert.rejects(
    () => deliverCode("email", "owner@example.test", "123456", "login"),
    { status: 503 },
  );
  assert.equal(timeout, 15000);
  assert.equal(calls, 3);
});
test("invalid recipient, channel and code are rejected before contacting Brevo", async () => {
  configure();
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
  });
  for (const contact of [
    "",
    "a@example.test,b@example.test",
    "a@example.test\r\nbcc: other@example.test",
    "Name <a@example.test>",
  ])
    await assert.rejects(() =>
      deliverCode("email", contact, "123456", "register"),
    );
  await assert.rejects(() =>
    deliverCode("email", "a@example.test", "bad", "register"),
  );
  await assert.rejects(() =>
    deliverCode("unknown", "a@example.test", "123456", "register"),
  );
  assert.equal(calls, 0);
});
test("production refuses classroom mode and selected Brevo never falls back to SMTP", async () => {
  configure();
  Object.assign(process.env, {
    NODE_ENV: "production",
    AUTH_DELIVERY_MODE: "test",
    GHARSEVA_DEMO: "true",
  });
  await assert.rejects(
    () => deliverCode("email", "a@example.test", "123456", "login"),
    /forbidden/,
  );
  assert.equal(identityOptions().demo, false);
});
test("UI capabilities show email-only, all-unavailable, social-only and fixed-invitation states accurately", () => {
  const o = { email: true, mobile: false, google: false, apple: false };
  for (const purpose of ["register", "recover", "verify"])
    assert.deepEqual(verificationAvailability(o, { purpose }), {
      channels: ["email"],
      social: [],
      available: true,
    });
  assert.equal(verificationAvailability({}).available, false);
  assert.equal(
    verificationAvailability({ google: true }, { purpose: "recover" })
      .available,
    false,
  );
  assert.equal(
    verificationAvailability({ google: true }, { purpose: "register" })
      .available,
    true,
  );
  assert.equal(
    verificationAvailability(o, { fixedChannel: "mobile" }).available,
    false,
  );
  assert.deepEqual(verificationAvailability({ mobile: true }).channels, [
    "mobile",
  ]);
});
test("strict CLI validates selected email only, fails missing/malformed settings, and sends no messages", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const cli = (overrides, args = ["--email-ready"]) =>
    spawnSync(process.execPath, ["scripts/check-integrations.js", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: { ...saved, ...brevo, ...overrides },
    });
  const ready = cli({});
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stdout, /configuration valid/);
  assert.ok(!ready.stdout.includes(brevo.BREVO_API_KEY));
  assert.ok(!ready.stdout.includes("SMTP_PASSWORD"));
  for (const overrides of [
    { BREVO_API_KEY: "" },
    { EMAIL_TRANSPORT: "invalid-secret" },
    { AUTH_DELIVERY_MODE: "test" },
  ]) {
    const r = cli(overrides);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Email readiness failed/);
    assert.ok(!r.stdout.includes("invalid-secret"));
  }
  const smtp = cli({}, ["--smtp-connect"]);
  assert.equal(smtp.status, 1);
  assert.match(smtp.stderr, /selected SMTP/);
  const loose = cli({ BREVO_API_KEY: "" }, []);
  assert.equal(loose.status, 0);
});
