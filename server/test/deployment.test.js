import { sessionFetch } from "./session-fixture.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createIsolatedMongo, connectIsolatedMongo } from "../../scripts/isolated-mongo.js";
import { createApp } from "../src/app.js";
import { User, Category, Booking } from "../src/models.js";
import { bootstrapProduction } from "../src/bootstrap.js";
import { inspectEnvironment, proxyHops } from "../src/deployment.js";

const production = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb://127.0.0.1:27017/deploy-test",
  JWT_SECRET: randomBytes(48).toString("hex"),
  IDENTITY_STORAGE_KEY: randomBytes(32).toString("hex"),
  CLIENT_ORIGIN: "https://gharseva.example.com",
  TRUST_PROXY_HOPS: "1",
  GHARSEVA_DEMO: "false",
  AUTH_DELIVERY_MODE: "live",
  PAYMENTS_MODE: "disabled",
  AUTH_GOOGLE_ENABLED: "false",
  AUTH_APPLE_ENABLED: "false",
  ASSISTANT_AI_ENABLED: "false",
};
const adminInput = {
  name: "Initial Administrator",
  email: "operator@example.com",
  mobile: "9876543210",
  password: "A-Unique-Admin123!",
};
let db, server, app, base, admin, deliveredCode;
before(async () => {
  Object.assign(process.env, production);
  db = await createIsolatedMongo();
  await connectIsolatedMongo(db);
  await Promise.all([User.init(), Category.init(), Booking.init()]);
  Object.assign(process.env, {
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fixture",
    SMTP_FROM: "fixture@example.test",
  });
  app = createApp({
    identityServices: {
      deliverCode: async (channel, email, code) => {
        deliveredCode = code;
      },
    },
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
});

test("production validation rejects unsafe settings without printing their values", () => {
  assert.deepEqual(
    inspectEnvironment(production, { requireBuild: false }).errors,
    [],
  );
  for (const override of [
    { JWT_SECRET: "replace_this_secret" },
    { IDENTITY_STORAGE_KEY: "missing" },
    { CLIENT_ORIGIN: "http://gharseva.example.com" },
    { CLIENT_ORIGIN: "https://gharseva.example.com/" },
    { CLIENT_ORIGIN: "https://user:secret@gharseva.example.com" },
    { TRUST_PROXY_HOPS: "true" },
    { GHARSEVA_DEMO: "true" },
    { AUTH_DELIVERY_MODE: "test" },
    { PAYMENTS_MODE: "demo" },
    { PAYMENTS_MODE: "live" },
    { PAYMENTS_MODE: "razorpay_test", RAZORPAY_KEY_ID: "rzp_live_secret" },
    { AUTH_GOOGLE_ENABLED: "true" },
    { ASSISTANT_AI_ENABLED: "true" },
    { PORT: "0" },
  ]) {
    const report = inspectEnvironment(
      { ...production, ...override },
      { requireBuild: false },
    );
    assert.ok(report.errors.length, JSON.stringify(Object.keys(override)));
    assert.ok(!report.errors.join(" ").includes("rzp_live_secret"));
  }
  assert.ok(
    inspectEnvironment(production, { dist: "/no-such-build" }).errors.some(
      (e) => e.includes("build"),
    ),
  );
  assert.equal(proxyHops({}), 0);
  assert.equal(app.get("trust proxy"), 1);
});

test("readiness checks MongoDB and refuses traffic readiness during draining", async () => {
  let r = await sessionFetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, database: "connected" });
  assert.match(r.headers.get("cache-control"), /no-store/);
  app.locals.draining = true;
  r = await sessionFetch(base + "/api/health");
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ok, false);
  assert.equal((await sessionFetch(base + "/api/health/live")).status, 200);
  app.locals.draining = false;
});

test("database disconnect makes readiness fail while liveness remains available", async () => {
  await mongoose.disconnect();
  try {
    const r = await sessionFetch(base + "/api/health");
    assert.equal(r.status, 503);
    assert.equal((await r.json()).database, "unavailable");
    assert.equal((await sessionFetch(base + "/api/health/live")).status, 200);
  } finally {
    await connectIsolatedMongo(db);
  }
});

test("bootstrap creates one hashed admin and preserves existing categories and users", async () => {
  const customer = await User.create({
    name: "Existing Customer",
    email: "customer@example.com",
    mobile: "9876543211",
    role: "customer",
    passwordHash: "existing-hash",
  });
  const category = await Category.create({
    slug: "plumbing",
    name: "Existing Plumbing",
    price: 450,
    enabled: false,
  });
  const result = await bootstrapProduction(adminInput);
  admin = await User.findById(result.adminId).select("+passwordHash");
  assert.equal(admin.role, "admin");
  assert.ok(await bcrypt.compare(adminInput.password, admin.passwordHash));
  assert.equal(admin.verification?.email?.at, undefined);
  assert.equal(await User.countDocuments(), 2);
  assert.equal((await User.findById(customer._id)).role, "customer");
  const preserved = await Category.findById(category._id);
  assert.equal(preserved.name, "Existing Plumbing");
  assert.equal(preserved.price, 450);
  assert.equal(preserved.enabled, false);
  assert.equal(await Category.countDocuments(), 10);
  assert.equal(await Booking.countDocuments(), 0);
});

test("bootstrap refuses a repeated run and never changes an existing role or password", async () => {
  const hash = admin.passwordHash;
  await assert.rejects(
    bootstrapProduction({ ...adminInput, password: "Different-Admin123!" }),
    /admin already exists/,
  );
  assert.equal(
    (await User.findById(admin._id).select("+passwordHash")).passwordHash,
    hash,
  );
  assert.equal(await User.countDocuments({ role: "admin" }), 1);
});

test("bootstrap refuses contact collisions and weak credentials before writing", async () => {
  await User.deleteOne({ _id: admin._id });
  await assert.rejects(
    bootstrapProduction({ ...adminInput, email: "customer@example.com" }),
    /already belongs/,
  );
  await assert.rejects(
    bootstrapProduction({ ...adminInput, password: "Short123" }),
    /at least 12/,
  );
  assert.equal(await User.countDocuments({ role: "admin" }), 0);
  const result = await bootstrapProduction(adminInput);
  admin = await User.findById(result.adminId);
});

test("hosted two-step login sets secure pending and session cookies and enforces exact origin", async () => {
  const body = JSON.stringify({
    identifier: adminInput.email,
    password: adminInput.password,
    portal: "admin",
  });
  const headers = {
    "Content-Type": "application/json",
    "X-GharSeva": "1",
    Origin: production.CLIENT_ORIGIN,
    "X-Forwarded-For": "198.51.100.8",
    "X-Forwarded-Proto": "https",
  };
  const r = await sessionFetch(base + "/api/auth/login", {
    method: "POST",
    headers,
    body,
  });
  assert.equal(r.status, 202);
  assert.equal((await r.json()).demoCode, undefined);
  const pending = r.headers
    .getSetCookie()
    .find((c) => c.startsWith("gharseva_pending_login="));
  for (const flag of [/HttpOnly/, /Secure/, /SameSite=Strict/])
    assert.match(pending, flag);
  assert.equal(
    r.headers.getSetCookie().some((c) => c.startsWith("gharseva_session=")),
    false,
  );
  const checked = await sessionFetch(base + "/api/auth/login/verify", {
    method: "POST",
    headers: { ...headers, Cookie: pending.split(";")[0] },
    body: JSON.stringify({ code: deliveredCode, portal: "admin" }),
  });
  assert.equal(checked.status, 200);
  const session = checked.headers
    .getSetCookie()
    .find((c) => c.startsWith("gharseva_session="));
  for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/])
    assert.match(session, flag);
  const blocked = await sessionFetch(base + "/api/auth/login", {
    method: "POST",
    headers: { ...headers, Origin: "https://untrusted.example.com" },
    body,
  });
  assert.equal(blocked.status, 403);
});

test("rate limits use the nearest forwarded client and cannot be changed by prepending an address", async () => {
  const login = (forwarded) =>
    sessionFetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GharSeva": "1",
        "X-Forwarded-For": forwarded,
      },
      body: "{}",
    });
  for (let i = 0; i < 30; i++)
    assert.notEqual((await login("198.51.100.20")).status, 429);
  assert.equal((await login("192.0.2.88, 198.51.100.20")).status, 429);
  assert.notEqual((await login("198.51.100.21")).status, 429);
});

test("built production routes and assets pass the read-only deployment smoke check", async () => {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../scripts/smoke-deployment.js", import.meta.url),
      ),
      base,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (x) => (output += x));
  child.stderr.on("data", (x) => (output += x));
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
  const html = await sessionFetch(base + "/login");
  assert.match(html.headers.get("cache-control"), /no-cache/);
  const js = (await html.text()).match(/src="(\/assets\/[^"?]+\.js)"/)[1];
  const asset = await sessionFetch(base + js);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.ok(html.headers.get("strict-transport-security"));
});

test(
  "real production entry point starts with persistent MongoDB and exits cleanly on SIGTERM",
  { timeout: 30000 },
  async () => {
    const reservation = createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../src/index.js", import.meta.url))],
      {
        env: {
          ...process.env,
          ...production,
          MONGODB_URI: db.getUri(),
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (output += x));
    const exited = once(child, "exit");
    try {
      let ready = false;
      for (
        let attempt = 0;
        attempt < 100 && child.exitCode === null;
        attempt++
      ) {
        try {
          ready =
            (
              await sessionFetch(`http://127.0.0.1:${port}/api/health`, {
                signal: AbortSignal.timeout(500),
              })
            ).status === 200;
        } catch {}
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, output);
      const anonymous = await sessionFetch(
        `http://127.0.0.1:${port}/api/auth/me`,
      );
      assert.equal(anonymous.status, 401);
      child.kill("SIGTERM");
      const [code] = await exited;
      assert.equal(code, 0, output);
      assert.ok(await User.exists({ _id: admin._id }));
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  },
);
