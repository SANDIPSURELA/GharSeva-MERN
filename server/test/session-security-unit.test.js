// Actual middleware and route handlers with atomic in-memory persistence.
// No real MongoDB, SMTP, Firebase or Razorpay connection is represented here.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import {
  Payment,
  User,
  AuthSession,
  PendingLogin,
  ContactThrottle,
} from "../src/models.js";
import { auth, setSession, sessionView } from "../src/auth.js";
import { createApp } from "../src/app.js";
import {
  SessionClient,
  openSessionChannel,
  bindSessionLifecycle,
} from "../../shared/session-client.js";
let rows, app, customer, provider, admin, other, env, deliveries, deliveryFails;
const id = () => String(new mongoose.Types.ObjectId());
const hash = (s) => createHash("sha256").update(s).digest("hex");
const clone = (v) =>
  v == null
    ? v
    : v instanceof Date
      ? new Date(v)
      : v instanceof mongoose.Types.ObjectId
        ? String(v)
        : Array.isArray(v)
          ? v.map(clone)
          : typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, v]) => [k, clone(v)]),
              )
            : v;
const value = (r, k) => k.split(".").reduce((o, k) => o?.[k], r);
const equal = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
function matches(r, f) {
  return Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((f) => matches(r, f));
    const a = value(r, k);
    if (v === null) return a == null;
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof Date) &&
      !(v instanceof mongoose.Types.ObjectId)
    )
      return Object.entries(v).every(([op, x]) =>
        op === "$gt"
          ? a > x
          : op === "$gte"
            ? a >= x
            : op === "$lt"
              ? a < x
              : op === "$lte"
                ? a <= x
                : op === "$in"
                  ? x.some((x) => equal(a, x))
                  : op === "$exists"
                    ? (a !== undefined) === x
                    : op === "$ne"
                      ? !equal(a, x)
                      : false,
      );
    return equal(a, v);
  });
}
function update(r, u) {
  for (const [k, v] of Object.entries(u.$set || {})) r[k] = clone(v);
  for (const [k, v] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + v;
  for (const [k, v] of Object.entries(u.$max || {}))
    if (r[k] == null || r[k] < v) r[k] = clone(v);
  for (const [k, v] of Object.entries(u.$push || {}))
    (r[k] ||= []).push(clone(v));
}
function query(v) {
  const p = Promise.resolve(clone(v));
  p.select = () => p;
  p.lean = () => p;
  return p;
}
function persistence(model) {
  const list = [];
  rows.set(model, list);
  mock.method(model, "create", async (input) => {
    const doc = new model(input);
    await doc.validate();
    const r = clone(doc.toObject());
    list.push(r);
    return clone(r);
  });
  mock.method(model, "findOne", (f) => query(list.find((r) => matches(r, f))));
  mock.method(model, "findById", (k) =>
    query(list.find((r) => equal(r._id, k))),
  );
  mock.method(model, "updateOne", async (f, u, options = {}) => {
    let r = list.find((r) => matches(r, f));
    if (!r && options.upsert) {
      r = { _id: f._id, ...clone(u.$setOnInsert) };
      list.push(r);
    }
    if (r) update(r, u);
    return { matchedCount: r ? 1 : 0, modifiedCount: r ? 1 : 0 };
  });
  mock.method(model, "findOneAndUpdate", (f, u) => {
    const r = list.find((r) => matches(r, f));
    if (r) update(r, u);
    return query(r);
  });
  mock.method(model, "deleteOne", async (f) => {
    const i = list.findIndex((r) => matches(r, f));
    if (i >= 0) list.splice(i, 1);
  });
}
function response() {
  const out = { status: 200, headers: {}, jar: new Map() };
  out.res = {
    set(k, v) {
      out.headers[k.toLowerCase()] = v;
    },
    cookie(k, v, options) {
      out.jar.set(k, v);
      out.cookieOptions = options;
    },
    clearCookie(k) {
      out.jar.delete(k);
    },
    status(n) {
      out.status = n;
      return this;
    },
    json(data) {
      out.data = clone(data);
      return this;
    },
  };
  return out;
}
async function credential(u, { fresh = true, old } = {}) {
  const r = response();
  r.session = await setSession(r.res, u, {
    req: old ? { headers: { cookie: old.cookie } } : undefined,
    reauthenticated: fresh,
  });
  r.cookie = [...r.jar].map(([k, v]) => k + "=" + v).join(";");
  r.context = r.session.context;
  return r;
}
async function call(
  path,
  {
    method = "GET",
    session,
    body = {},
    jar = session?.jar,
    context = session?.context,
  } = {},
) {
  const layer = app.router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()],
  );
  if (!layer) throw Error("No route " + path);
  const req = {
    method,
    path,
    originalUrl: path,
    headers: {
      cookie: jar ? [...jar].map(([k, v]) => k + "=" + v).join(";") : "",
      ...(context ? { "x-gharseva-context": context } : {}),
    },
    body,
    params: { id: customer._id },
    query: {},
    get(k) {
      return this.headers[k.toLowerCase()];
    },
  };
  const out = response();
  out.jar = new Map(jar);
  out.res.cookie = (k, v, o) => {
    out.jar.set(k, v);
    out.cookieOptions = o;
  };
  out.res.clearCookie = (k) => out.jar.delete(k);
  try {
    for (const l of layer.route.stack) {
      const fn = l.handle;
      if (fn.resetKey) continue;
      let error;
      let nextCalled = false;
      await fn(req, out.res, (e) => {
        error = e;
        nextCalled = true;
      });
      if (error) throw error;
      if (!nextCalled && out.data !== undefined) break;
    }
  } catch (e) {
    out.status = e.status || 500;
    out.data = { message: e.message, code: e.code };
  }
  return out;
}
beforeEach(async () => {
  env = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: randomBytes(48).toString("hex"),
    GHARSEVA_DEMO: "true",
    AUTH_DELIVERY_MODE: "test",
  });
  delete process.env.ADMIN_IDLE_MINUTES;
  delete process.env.SESSION_ABSOLUTE_HOURS;
  delete process.env.ADMIN_REAUTH_MINUTES;
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  rows = new Map();
  for (const m of [User, AuthSession, PendingLogin, ContactThrottle])
    persistence(m);
  mock.method(PendingLogin.prototype, "save", async function () {
    await this.validate();
    rows.get(PendingLogin).push(clone(this.toObject()));
    return this;
  });
  const passwordHash = await bcrypt.hash("Example123!", 4);
  const account = (role) => ({
    _id: id(),
    name: "Fixture " + role,
    email: role + "@example.com",
    mobile: "987650000" + rows.get(User).length,
    passwordHash,
    role,
    status: "ACTIVE",
    sessionVersion: 0,
    loginRevision: 0,
  });
  customer = account("customer");
  rows.get(User).push(customer);
  provider = account("provider");
  rows.get(User).push(provider);
  admin = account("admin");
  rows.get(User).push(admin);
  other = { ...customer, _id: id(), email: "other@example.com" };
  rows.get(User).push(other);
  deliveries = [];
  deliveryFails = false;
  app = createApp({
    identityServices: {
      deliverCode: async (channel, destination, code, purpose) => {
        if (deliveryFails) throw Error("delivery unavailable");
        deliveries.push({ channel, destination, code, purpose });
      },
    },
  });
});
afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
});
test("one valid HttpOnly session is reusable across tabs; copied URLs and wrong roles grant no admin access", async () => {
  const c = await credential(customer);
  assert.equal(c.cookieOptions.httpOnly, true);
  assert.equal(c.cookieOptions.sameSite, "lax");
  assert.equal(c.cookieOptions.secure, false);
  const [a, b] = await Promise.all([
    call("/api/auth/me", { session: c }),
    call("/api/auth/me", { session: c }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.data._id, customer._id);
  assert.equal(a.headers["cache-control"], "no-store, private");
  assert.equal(a.data.passwordHash, undefined);
  assert.equal((await call("/api/admin/overview")).status, 401);
  assert.equal((await call("/api/admin/overview", { session: c })).status, 403);
  assert.equal(
    (await call("/api/admin/overview", { session: await credential(provider) }))
      .status,
    403,
  );
  process.env.NODE_ENV = "production";
  assert.equal((await credential(admin)).cookieOptions.secure, true);
});
test("logout invalidates the exact saved credential and preserves an independent device session", async () => {
  const first = await credential(customer),
    device = await credential(customer);
  const out = await call("/api/auth/logout", {
    method: "POST",
    session: first,
  });
  assert.equal(out.status, 200);
  assert.equal(out.jar.has("gharseva_session"), false);
  assert.equal((await call("/api/auth/me", { session: first })).status, 401);
  assert.equal((await call("/api/auth/me", { session: device })).status, 200);
  assert.equal(
    (await call("/api/auth/logout", { method: "POST", session: first })).status,
    200,
  );
});
test("account switching revokes the previous browser credential and rejects stale form/session contexts", async () => {
  const a = await credential(customer),
    device = await credential(customer),
    b = await credential(other, { old: a });
  assert.equal((await call("/api/auth/me", { session: a })).status, 401);
  assert.equal((await call("/api/auth/me", { session: device })).status, 200);
  const stale = await call("/api/auth/change-password", {
    method: "POST",
    session: b,
    context: a.context,
    body: { currentPassword: "Example123!", newPassword: "Replacement123!" },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, "SESSION_CONTEXT_CHANGED");
  assert.equal(other.sessionVersion, 0);
  assert.equal(
    (
      await call("/api/auth/logout", {
        method: "POST",
        session: b,
        context: a.context,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("/api/auth/me", { session: b })).data._id,
    other._id,
  );
  assert.equal(
    (
      await call("/api/auth/change-password", {
        method: "POST",
        session: b,
        context: null,
      })
    ).status,
    409,
  );
});
test("legacy signed JWTs without revocable records require re-login and forged credentials are rejected", async () => {
  const legacy = jwt.sign(
    { sub: customer._id, ver: 0 },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );
  const jar = new Map([["gharseva_session", legacy]]);
  const r = await call("/api/auth/me", { jar });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, "LEGACY_SESSION");
  assert.equal(
    (
      await call("/api/auth/me", {
        jar: new Map([["gharseva_session", "forged"]]),
      })
    ).status,
    401,
  );
});
test("password change revokes sessions on all devices and suspension/role changes invalidate records", async () => {
  const a = await credential(customer),
    b = await credential(customer);
  const r = await call("/api/auth/change-password", {
    method: "POST",
    session: a,
    body: { currentPassword: "Example123!", newPassword: "Replacement123!" },
  });
  assert.equal(r.status, 200);
  assert.equal((await call("/api/auth/me", { session: a })).status, 401);
  assert.equal((await call("/api/auth/me", { session: b })).status, 401);
  const p = await credential(provider);
  provider.status = "SUSPENDED";
  assert.equal((await call("/api/auth/me", { session: p })).status, 401);
  provider.status = "ACTIVE";
  assert.equal((await call("/api/auth/me", { session: p })).status, 401);
  const c = await credential(other);
  other.role = "provider";
  assert.equal((await call("/api/auth/me", { session: c })).status, 401);
  other.role = "customer";
  assert.equal((await call("/api/auth/me", { session: c })).status, 401);
});
test("server idle deadline expires despite foreground polling, metadata reads and background refreshes", async () => {
  const s = await credential(admin),
    original = new Date(s.session.idleExpiresAt).getTime();
  for (let n = 0; n < 14; n++) {
    mock.timers.tick(60000);
    assert.equal((await call("/api/auth/session", { session: s })).status, 200);
  }
  assert.equal(
    new Date(rows.get(AuthSession)[0].idleExpiresAt).getTime(),
    original,
  );
  mock.timers.tick(60000);
  assert.equal((await call("/api/auth/me", { session: s })).status, 401);
});
test("explicit Stay signed in extends idle only before expiry and never extends absolute lifetime", async () => {
  process.env.SESSION_ABSOLUTE_HOURS = "1";
  const s = await credential(admin),
    absolute = new Date(s.session.expiresAt).getTime();
  for (let n = 0; n < 5; n++) {
    mock.timers.tick(10 * 60000);
    assert.equal(
      (await call("/api/auth/session/activity", { method: "POST", session: s }))
        .status,
      200,
    );
  }
  mock.timers.tick(9 * 60000);
  const r = await call("/api/auth/session/activity", {
    method: "POST",
    session: s,
  });
  assert.equal(new Date(r.data.idleExpiresAt).getTime(), absolute);
  assert.equal(
    new Date(rows.get(AuthSession)[0].expiresAt).getTime(),
    absolute,
  );
  mock.timers.tick(60001);
  assert.equal(
    (await call("/api/auth/session/activity", { method: "POST", session: s }))
      .status,
    401,
  );
  const customerSession = await credential(customer);
  assert.equal(
    (
      await call("/api/auth/session/activity", {
        method: "POST",
        session: customerSession,
      })
    ).status,
    403,
  );
});
test("admin recent-auth window gates actual account-access endpoint; completed OTP proof is session bound and single-use", async () => {
  const s = await credential(admin);
  mock.timers.tick(5 * 60000);
  const action = () =>
    call("/api/admin/users/:id", {
      method: "PATCH",
      session: s,
      body: { status: "SUSPENDED" },
    });
  assert.equal((await action()).data.code, "REAUTH_REQUIRED");
  assert.equal(customer.status, "ACTIVE");
  assert.equal(
    (
      await call("/api/auth/reauth", {
        method: "POST",
        session: s,
        body: { password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(rows.get(PendingLogin).length, 0);
  const p = await call("/api/auth/reauth", {
    method: "POST",
    session: s,
    body: {
      password: "Example123!",
      identifier: customer.email,
      portal: "customer",
    },
  });
  assert.equal(p.status, 202);
  assert.equal(deliveries[0].purpose, "admin_reauth");
  assert.equal(deliveries[0].destination, admin.email);
  assert.equal(p.jar.get("gharseva_session"), s.jar.get("gharseva_session"));
  const signed = await call("/api/auth/reauth/verify", {
    method: "POST",
    session: s,
    jar: p.jar,
    body: { code: p.data.demoCode },
  });
  assert.equal(signed.status, 200);
  assert.equal((await action()).status, 200);
  assert.equal(customer.status, "SUSPENDED");
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: s,
        jar: p.jar,
        body: { code: p.data.demoCode },
      })
    ).status,
    401,
  );
  assert.equal((await action()).status, 200);
  mock.timers.tick(5 * 60000);
  assert.equal((await action()).data.code, "REAUTH_REQUIRED");
});
test("reauth challenge substitution, incorrect codes, expiry and revoked-session verification cannot grant proof", async () => {
  const a = await credential(admin, { fresh: false }),
    b = await credential(admin, { fresh: false });
  let p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  assert.equal(p.status, 202);
  const swapped = new Map(p.jar);
  swapped.set("gharseva_session", b.jar.get("gharseva_session"));
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: b,
        jar: swapped,
        body: { code: p.data.demoCode },
      })
    ).status,
    401,
  );
  mock.timers.tick(60001);
  p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  for (let n = 0; n < 5; n++)
    assert.equal(
      (
        await call("/api/auth/reauth/verify", {
          method: "POST",
          session: a,
          jar: p.jar,
          body: { code: "000000" },
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: p.data.demoCode },
      })
    ).status,
    401,
  );
  assert.equal(
    rows.get(AuthSession).every((s) => !s.reauthenticatedAt),
    true,
  );
});
test("expired admin email code, live delivery failure and customer reauth attempts do not bypass proof", async () => {
  const a = await credential(admin, { fresh: false });
  const p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  mock.timers.tick(5 * 60000 + 1);
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: p.data.demoCode },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/auth/reauth", {
        method: "POST",
        session: await credential(customer),
        body: { password: "Example123!" },
      })
    ).status,
    403,
  );
  Object.assign(process.env, {
    GHARSEVA_DEMO: "false",
    AUTH_DELIVERY_MODE: "live",
    SMTP_HOST: "fixture.invalid",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "not-a-real-secret",
    SMTP_FROM: "fixture@example.com",
  });
  deliveryFails = true;
  const liveSession = await credential(admin, { fresh: false });
  const failed = await call("/api/auth/reauth", {
    method: "POST",
    session: liveSession,
    body: { password: "Example123!" },
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.data.demoCode, undefined);
  assert.equal(
    rows.get(AuthSession).find((s) => s.context === liveSession.context)
      .reauthenticatedAt,
    undefined,
  );
});
test("competing admin code verifications consume proof once and logout prevents reauthentication", async () => {
  const a = await credential(admin, { fresh: false });
  const p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  const result = await Promise.all(
    [1, 2].map(() =>
      call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: p.data.demoCode },
      }),
    ),
  );
  assert.equal(result.filter((r) => r.status === 200).length, 1);
  assert.equal(result.filter((r) => r.status === 409).length, 1);
  mock.timers.tick(60001);
  const next = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  await call("/api/auth/logout", { method: "POST", session: a });
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: next.jar,
        body: { code: next.data.demoCode },
      })
    ).status,
    401,
  );
});
test("reauth resend preserves attempt count, invalidates old code and cannot cross into login purpose", async () => {
  const a = await credential(admin, { fresh: false });
  const p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  assert.equal(
    (
      await call("/api/auth/reauth/resend", {
        method: "POST",
        session: a,
        jar: p.jar,
      })
    ).status,
    429,
  );
  await call("/api/auth/reauth/verify", {
    method: "POST",
    session: a,
    jar: p.jar,
    body: { code: "000000" },
  });
  mock.timers.tick(60001);
  const resend = await call("/api/auth/reauth/resend", {
    method: "POST",
    session: a,
    jar: p.jar,
  });
  assert.equal(resend.status, 200);
  assert.notEqual(resend.data.demoCode, p.data.demoCode);
  assert.equal(rows.get(PendingLogin).at(-1).attempts, 1);
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: p.data.demoCode },
      })
    ).status,
    400,
  );
  const substituted = new Map([
    ["gharseva_pending_login", p.jar.get("gharseva_pending_reauth")],
  ]);
  assert.equal(
    (
      await call("/api/auth/login/verify", {
        method: "POST",
        jar: substituted,
        context: null,
        body: { code: resend.data.demoCode },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: resend.data.demoCode },
      })
    ).status,
    200,
  );
});
test("nonce alone does not authenticate and contact/password changes invalidate stale admin proof", async () => {
  const a = await credential(admin);
  assert.equal(
    (await call("/api/auth/me", { context: a.context })).status,
    401,
  );
  admin.loginRevision++;
  assert.equal(
    (
      await call("/api/admin/users/:id", {
        method: "PATCH",
        session: a,
        body: { status: "SUSPENDED" },
      })
    ).data.code,
    "REAUTH_REQUIRED",
  );
  assert.equal(customer.status, "ACTIVE");
  const p = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  admin.email = "changed@example.com";
  admin.loginRevision++;
  assert.equal(
    (
      await call("/api/auth/reauth/verify", {
        method: "POST",
        session: a,
        jar: p.jar,
        body: { code: p.data.demoCode },
      })
    ).status,
    401,
  );
});
test("existing refund mutation endpoint rejects direct recent-auth bypass before touching ledger", async () => {
  let queried = 0;
  mock.method(Payment, "findById", async () => {
    queried++;
    return null;
  });
  const a = await credential(admin, { fresh: false });
  const p = "/api/payments/:id/demo-refund";
  assert.equal(
    (await call(p, { method: "POST", session: a, body: { confirm: true } }))
      .data.code,
    "REAUTH_REQUIRED",
  );
  assert.equal(queried, 0);
  const proof = await call("/api/auth/reauth", {
    method: "POST",
    session: a,
    body: { password: "Example123!" },
  });
  await call("/api/auth/reauth/verify", {
    method: "POST",
    session: a,
    jar: proof.jar,
    body: { code: proof.data.demoCode },
  });
  assert.equal(
    (await call(p, { method: "POST", session: a, body: { confirm: true } }))
      .status,
    404,
  );
  assert.equal(queried, 1);
});
const http = (data, status = 200, meta) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(meta ? { "X-GharSeva-Session": JSON.stringify(meta) } : {}),
    },
  });
const meta = (context) => ({
  context,
  role: "customer",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
test("client learns identity only from server, sends context in memory and never accepts account changes from a response", async () => {
  let changed = false;
  const requests = [],
    signals = [];
  const c = new SessionClient(
    async (path, options) => {
      requests.push({ path, options });
      return http(
        { _id: changed ? other._id : customer._id },
        200,
        meta(changed ? "B" : "A"),
      );
    },
    (...x) => signals.push(x),
  );
  await c.request("/auth/me", { recheck: true });
  assert.equal(c.context, "A");
  assert.equal(requests[0].options.credentials, "include");
  assert.equal(requests[0].options.cache, "no-store");
  await c.request("/bookings");
  assert.equal(requests[1].options.headers["X-GharSeva-Context"], "A");
  changed = true;
  await assert.rejects(
    () => c.request("/auth/me", { recheck: true }),
    (e) => e.code === "SESSION_CONTEXT_CHANGED",
  );
  assert.equal(c.context, "A");
  assert.equal(c.locked, true);
  assert.ok(signals.some((x) => x[0] === "invalidated"));
});
test("late private responses are discarded after invalidation even if fetch ignores AbortSignal", async () => {
  let release, signal;
  const c = new SessionClient((path, options) => {
    signal = options.signal;
    return new Promise((resolve) => (release = resolve));
  });
  c.context = "A";
  const pending = c.request("/bookings");
  c.invalidate();
  release(http([{ address: "Old private fixture address" }], 200, meta("A")));
  await assert.rejects(
    () => pending,
    (e) => e.code === "STALE_RESPONSE",
  );
  assert.equal(signal.aborted, true);
  assert.equal(c.meta, null);
});
test("stale forms and pending reauthentication cannot submit or retry under a switched identity", async () => {
  let calls = 0,
    finish;
  const c = new SessionClient(async () => {
    calls++;
    return http(
      { message: "Confirm", code: "REAUTH_REQUIRED" },
      403,
      meta("A"),
    );
  });
  c.context = "A";
  c.reauthenticate = () => new Promise((resolve) => (finish = resolve));
  const action = c.request("/admin/users/id", {
    method: "PATCH",
    body: { status: "SUSPENDED" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  c.invalidate();
  finish();
  await assert.rejects(() => action, /Session changed/);
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      c.request("/payments/booking/id/order", {
        method: "POST",
        body: { acceptBalance: true },
      }),
    (e) => e.code === "STALE_SESSION",
  );
  assert.equal(calls, 1);
});
test("401 invalidates private state, ordinary 403 rechecks, and a recent-auth check retries only its original action once", async () => {
  let status = 403,
    code,
    requests = 0,
    proofs = 0;
  const signals = [];
  const c = new SessionClient(
    async () => {
      requests++;
      return status === 200
        ? http({ ok: true }, 200, meta("A"))
        : http({ message: "Denied", code }, status, meta("A"));
    },
    (...a) => signals.push(a),
  );
  c.context = "A";
  await assert.rejects(
    () => c.request("/admin/overview"),
    (e) => e.status === 403,
  );
  assert.equal(c.locked, false);
  assert.ok(signals.some((x) => x[0] === "forbidden"));
  code = "REAUTH_REQUIRED";
  c.reauthenticate = async () => {
    proofs++;
    status = 200;
  };
  assert.deepEqual(
    await c.request("/admin/users/id", {
      method: "PATCH",
      body: { status: "SUSPENDED" },
    }),
    { ok: true },
  );
  assert.equal(proofs, 1);
  assert.equal(requests, 3);
  status = 401;
  code = "SESSION_EXPIRED";
  await assert.rejects(() => c.request("/bookings"));
  assert.equal(c.locked, true);
  assert.ok(signals.some((x) => x[0] === "invalidated"));
});
test("BroadcastChannel and storage fallback carry only invalidation signals and deduplicate the same signal", () => {
  const channels = [],
    messages = [];
  class Broadcast {
    constructor() {
      channels.push(this);
    }
    postMessage(data) {
      messages.push(data);
      for (const c of channels) if (c !== this) c.onmessage?.({ data });
    }
    close() {
      channels.splice(channels.indexOf(this), 1);
    }
  }
  const storageListeners = [];
  const events = {
    addEventListener: (n, fn) => storageListeners.push(fn),
    removeEventListener: (n, fn) =>
      storageListeners.splice(storageListeners.indexOf(fn), 1),
  };
  const storage = {
    setItem: (key, newValue) => {
      for (const fn of storageListeners) fn({ key, newValue });
    },
    removeItem() {},
  };
  let a = 0,
    b = 0;
  const first = openSessionChannel(() => a++, { Broadcast, storage, events }),
    second = openSessionChannel(() => b++, { Broadcast, storage, events });
  first.send();
  assert.equal(b, 1);
  assert.deepEqual(Object.keys(messages[0]).sort(), ["nonce", "type"]);
  assert.equal(messages[0].type, "invalidate");
  assert.ok(!JSON.stringify(messages).includes(customer.email));
  first.close();
  second.close();
  let fallback = 0;
  const third = openSessionChannel(() => fallback++, {
    Broadcast: null,
    storage,
    events,
  });
  third.send();
  assert.equal(fallback, 1);
  third.close();
  assert.equal(storageListeners.length, 0);
});
test("focus, visible restoration and Back/Forward restoration revalidate; page hiding suspends private responses", () => {
  const win = new EventTarget(),
    doc = new EventTarget();
  doc.visibilityState = "visible";
  let checked = 0,
    hidden = 0;
  const cleanup = bindSessionLifecycle({
    window: win,
    document: doc,
    revalidate: () => checked++,
    suspend: () => hidden++,
  });
  win.dispatchEvent(new Event("focus"));
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(checked, 1);
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(checked, 3);
  assert.equal(hidden, 1);
  cleanup();
  win.dispatchEvent(new Event("focus"));
  assert.equal(checked, 3);
});
test("classroom sessions cannot authenticate once explicit non-production demo mode is disabled", async () => {
  const c = await credential(customer);
  assert.equal(c.session.mode, "demo");
  process.env.NODE_ENV = "production";
  assert.equal((await call("/api/auth/me", { session: c })).status, 401);
  process.env.NODE_ENV = "test";
  assert.equal((await call("/api/auth/me", { session: c })).status, 401);
});
test("identity rechecks do not recursively schedule themselves after an account-context change", async () => {
  let calls = 0,
    checks = 0,
    rechecking;
  const c = new SessionClient(
    async () => {
      calls++;
      return http({ _id: other._id }, 200, meta("B"));
    },
    (type) => {
      if (type === "recheck") {
        checks++;
        rechecking = c
          .request("/auth/me", { recheck: true })
          .catch((e) => e.code);
      }
    },
  );
  c.context = "A";
  await assert.rejects(
    () => c.request("/bookings"),
    (e) => e.code === "SESSION_CONTEXT_CHANGED",
  );
  assert.equal(await rechecking, "SESSION_CONTEXT_CHANGED");
  assert.equal(checks, 1);
  assert.equal(calls, 2);
  assert.equal(c.locked, true);
});
test("suspending and re-enabling through the real admin endpoint cannot revive an older credential", async () => {
  const old = await credential(customer),
    a = await credential(admin);
  assert.equal(
    (
      await call("/api/admin/users/:id", {
        method: "PATCH",
        session: a,
        body: { status: "SUSPENDED" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/admin/users/:id", {
        method: "PATCH",
        session: a,
        body: { status: "ACTIVE" },
      })
    ).status,
    200,
  );
  assert.equal((await call("/api/auth/me", { session: old })).status, 401);
  assert.equal(
    (await call("/api/auth/me", { session: await credential(customer) }))
      .status,
    200,
  );
});
test("a concurrent logout wins over an already authenticated idle-extension write", async () => {
  const a = await credential(admin);
  const original = AuthSession.findOneAndUpdate;
  mock.method(AuthSession, "findOneAndUpdate", (f, u, o) => {
    rows
      .get(AuthSession)
      .find((s) => String(s._id) === String(a.session._id)).revokedAt =
      new Date(Date.now());
    return original(f, u, o);
  });
  const r = await call("/api/auth/session/activity", {
    method: "POST",
    session: a,
    body: { expiresAt: "2099-01-01", idleExpiresAt: "2099-01-01" },
  });
  assert.equal(r.status, 401);
  assert.equal((await call("/api/auth/me", { session: a })).status, 401);
});
test("expired or invalid-signature cookies can be cleared without an impossible context bootstrap", async () => {
  const a = await credential(customer);
  process.env.JWT_SECRET = "rotated-only-in-this-fixture";
  assert.equal((await call("/api/auth/me", { session: a })).status, 401);
  const r = await call("/api/auth/logout", {
    method: "POST",
    session: a,
    context: null,
  });
  assert.equal(r.status, 200);
  assert.equal(r.jar.has("gharseva_session"), false);
  assert.ok(rows.get(AuthSession)[0].revokedAt);
});
test("malformed server deadlines and future/invalid recent-proof dates fail closed", async () => {
  const a = await credential(admin),
    s = rows.get(AuthSession)[0];
  s.reauthenticatedAt = new Date(Date.now() + 60000);
  assert.equal(
    (
      await call("/api/admin/users/:id", {
        method: "PATCH",
        session: a,
        body: { status: "SUSPENDED" },
      })
    ).data.code,
    "REAUTH_REQUIRED",
  );
  s.reauthenticatedAt = new Date(NaN);
  assert.equal(
    (
      await call("/api/admin/users/:id", {
        method: "PATCH",
        session: a,
        body: { status: "SUSPENDED" },
      })
    ).data.code,
    "REAUTH_REQUIRED",
  );
  s.idleExpiresAt = new Date(NaN);
  assert.equal((await call("/api/auth/me", { session: a })).status, 401);
  assert.equal(customer.status, "ACTIVE");
});
