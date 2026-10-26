import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import {
  deliverCode,
  smtpTransportOptions,
  verifySmtpConnection,
  identityOptions,
} from "../src/identity-services.js";
const env = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
});
function live() {
  Object.assign(process.env, {
    NODE_ENV: "development",
    AUTH_DELIVERY_MODE: "live",
    GHARSEVA_DEMO: "false",
    SMTP_HOST: "smtp.invalid",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fixture",
    SMTP_FROM: "GharSeva <fixture@example.test>",
    SMTP_PORT: "587",
  });
}
test("SMTP validates ports, requires server credentials and preserves mandatory TLS/timeouts", () => {
  live();
  const options = smtpTransportOptions();
  assert.equal(options.requireTLS, true);
  assert.equal(options.secure, false);
  assert.equal(options.greetingTimeout, 10000);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.tls?.rejectUnauthorized, undefined);
  assert.equal(
    smtpTransportOptions({ ...process.env, SMTP_PORT: "465" }).secure,
    true,
  );
  for (const port of ["abc", "-1", "65536", "1.5"])
    assert.throws(() =>
      smtpTransportOptions({ ...process.env, SMTP_PORT: port }),
    );
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])
    assert.throws(() => smtpTransportOptions({ ...process.env, [key]: "" }));
});
test("email delivery uses only its caller's registered-email destination and never SMS", async () => {
  live();
  let sent;
  mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (input) => {
      sent = input;
      return { accepted: ["owner@example.test"], rejected: [] };
    },
  }));
  await deliverCode("email", "owner@example.test", "123456", "login");
  assert.equal(sent.to, "owner@example.test");
  assert.match(sent.text, /sign-in/);
  assert.equal(identityOptions().demo, false);
});
test("SMTP rejection, empty acceptance and provider errors all fail with a safe message", async () => {
  live();
  for (const response of [
    { accepted: [], rejected: [] },
    { accepted: ["different@example.test"], rejected: [] },
    { accepted: ["owner@example.test"], rejected: ["owner@example.test"] },
    null,
  ]) {
    mock.restoreAll();
    mock.method(nodemailer, "createTransport", () => ({
      sendMail: async () => {
        if (!response) throw Error("private provider response");
        return response;
      },
    }));
    await assert.rejects(
      () => deliverCode("email", "owner@example.test", "123456", "login"),
      (e) =>
        e.status === 503 &&
        !e.message.includes("123456") &&
        !e.message.includes("private"),
    );
  }
});
test("explicit classroom mode performs no SMTP connection; production does not inherit it", async () => {
  live();
  process.env.AUTH_DELIVERY_MODE = "test";
  process.env.GHARSEVA_DEMO = "true";
  let calls = 0;
  mock.method(nodemailer, "createTransport", () => {
    calls++;
    throw Error("unexpected transport");
  });
  await deliverCode("email", "fictional@example.com", "123456", "login");
  assert.equal(calls, 0);
  process.env.NODE_ENV = "production";
  await assert.rejects(() =>
    deliverCode("email", "fictional@example.com", "123456", "login"),
  );
  assert.equal(calls, 0);
});
test("connection check authenticates without sending a message and always closes transport", async () => {
  live();
  let verifies = 0,
    sends = 0,
    closes = 0;
  mock.method(nodemailer, "createTransport", () => ({
    verify: async () => {
      verifies++;
    },
    sendMail: async () => {
      sends++;
    },
    close: () => {
      closes++;
    },
  }));
  await verifySmtpConnection();
  assert.equal(verifies, 1);
  assert.equal(sends, 0);
  assert.equal(closes, 1);
});
test("connection-check failure remains sanitized and cannot be called successful delivery", async () => {
  live();
  let closed = false;
  mock.method(nodemailer, "createTransport", () => ({
    verify: async () => {
      throw Error("credential=private");
    },
    close: () => {
      closed = true;
    },
  }));
  await assert.rejects(
    verifySmtpConnection,
    (e) => e.status === 503 && !e.message.includes("private"),
  );
  assert.equal(closed, true);
});
