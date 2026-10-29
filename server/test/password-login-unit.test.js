// In-process route tests with mocked persistence/delivery. These run without a
// listening socket; login.test.js separately checks real MongoDB + HTTP semantics.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  AuthSession,
  User,
  PendingLogin,
  ContactThrottle,
  ContactChallenge,
  ExternalIdentity,
  RegistrationSession,
  PasswordRecovery,
} from "../src/models.js";
import { createApp } from "../src/app.js";
import { createHash } from "node:crypto";
import { mountPasswordLogin } from "../src/password-login.js";
import { mountRegistration } from "../src/registration.js";
import { auth, role as requireRole } from "../src/auth.js";
import {
  authDestination,
  safeReturnPath,
  loginAliasState,
} from "../../shared/auth-navigation.js";
import { checkStoredLoginRole } from "../src/login-policy.js";
import {
  externalIdentityFromClaims,
  deliverCode,
} from "../src/identity-services.js";

let tables,
  routes,
  delivery,
  deliveryFails,
  identities,
  savedEnvironment,
  useRealDelivery;
const same = (a, b) =>
  a instanceof Date || b instanceof Date
    ? new Date(a).getTime() === new Date(b).getTime()
    : String(a) === String(b);
function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((f) => matches(record, f));
    const value = record[key];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date) &&
      !(expected instanceof mongoose.Types.ObjectId)
    ) {
      return Object.entries(expected).every(([op, arg]) =>
        op === "$gt"
          ? value > arg
          : op === "$gte"
            ? value >= arg
            : op === "$lt"
              ? value < arg
              : op === "$lte"
                ? value <= arg
                : op === "$ne"
                  ? !same(value, arg)
                  : op === "$in"
                    ? arg.some((a) => same(value, a))
                    : op === "$exists"
                      ? (value !== undefined) === arg
                      : false,
      );
    }
    return same(value, expected);
  });
}
const clone = (value) =>
  value == null
    ? value
    : {
        ...value,
        ...(value.codeHistory ? { codeHistory: [...value.codeHistory] } : {}),
      };
function update(record, changes, inserting = false) {
  Object.assign(
    record,
    changes.$set || {},
    inserting ? changes.$setOnInsert || {} : {},
  );
  for (const [key, value] of Object.entries(changes.$addToSet || {})) {
    if (!(record[key] || []).includes(value)) (record[key] ||= []).push(value);
  }
  for (const [key, count] of Object.entries(changes.$inc || {}))
    record[key] = (record[key] || 0) + count;
  for (const [key, value] of Object.entries(changes.$push || {}))
    (record[key] ||= []).push(value);
}
function query(value) {
  const result = Promise.resolve(value);
  result.select = () => result;
  return result;
}
function persistence(model) {
  const rows = [];
  tables.set(model, rows);
  mock.method(model, "findOne", (filter) =>
    query(clone(rows.find((r) => matches(r, filter)))),
  );
  mock.method(model, "findById", (id) =>
    query(clone(rows.find((r) => same(r._id, id)))),
  );
  mock.method(model, "exists", (filter) =>
    query(rows.some((r) => matches(r, filter))),
  );
  mock.method(model, "create", async (data) => {
    if (
      model === User &&
      rows.some((row) => row.email === data.email || row.mobile === data.mobile)
    )
      throw Object.assign(Error("fixture duplicate account"), { code: 11000 });
    if (model === ExternalIdentity && rows.some((row) => row.uid === data.uid))
      throw Object.assign(Error("fixture duplicate identity"), { code: 11000 });
    const record = { _id: new mongoose.Types.ObjectId(), ...data };
    rows.push(record);
    return clone(record);
  });
  mock.method(model, "deleteOne", async (filter) => {
    const i = rows.findIndex((r) => matches(r, filter));
    if (i !== -1) rows.splice(i, 1);
    return { deletedCount: i === -1 ? 0 : 1 };
  });
  mock.method(model, "updateMany", (filter, changes) => {
    for (const row of rows) if (matches(row, filter)) update(row, changes);
    return query({ modifiedCount: rows.length });
  });
  mock.method(model, "updateOne", (filter, changes, options = {}) => {
    let record = rows.find((r) => matches(r, filter));
    const inserting = !record && options.upsert;
    if (inserting) {
      record = { _id: filter._id };
      rows.push(record);
    }
    if (record) update(record, changes, inserting);
    return query({
      matchedCount: record ? 1 : 0,
      modifiedCount: record ? 1 : 0,
    });
  });
  mock.method(model, "findOneAndUpdate", (filter, changes, options = {}) => {
    const record = rows.find((r) => matches(r, filter));
    const before = clone(record);
    if (record) update(record, changes);
    return query(options.returnDocument === "after" ? clone(record) : before);
  });
}
const account = async (role = "customer") => {
  const n = tables.get(User).length;
  return User.create({
    name: "Test Account",
    email: "account" + n + "@example.com",
    mobile: "987650000" + n,
    passwordHash: await bcrypt.hash("Example123!", 4),
    status: "ACTIVE",
    role,
    sessionVersion: 0,
    profile: role === "provider" ? { status: "PENDING" } : undefined,
  });
};
async function call(method, path, body = {}, cookies = new Map()) {
  const req = {
    body,
    headers: { cookie: [...cookies].map(([k, v]) => k + "=" + v).join(";") },
  };
  const response = { status: 200, data: null, cookies: new Map(cookies) };
  const res = {
    cookie: (k, v) => {
      response.cookies.set(k, v);
    },
    clearCookie: (k) => {
      response.cookies.delete(k);
    },
    status: (status) => {
      response.status = status;
      return res;
    },
    json: (data) => {
      response.data = data;
      return res;
    },
  };
  try {
    await routes.get(method + path)(req, res);
  } catch (e) {
    response.status = e.status || 500;
    response.data = { message: e.message };
  }
  return response;
}
const begin = (user, extra = {}) =>
  call("post", "/api/auth/login", {
    identifier: user.email,
    password: "Example123!",
    ...extra,
  });
const verify = (pending, extra = {}, cookies = pending.cookies) =>
  call(
    "post",
    "/api/auth/login/verify",
    {
      code: pending.data.demoCode,
      ...extra,
    },
    cookies,
  );
const record = () => tables.get(PendingLogin).at(-1);
const allowResend = () => {
  record().nextSendAt = new Date(0);
  for (const row of tables.get(ContactThrottle))
    row.nextAllowedAt = new Date(0);
};
beforeEach(() => {
  savedEnvironment = { ...process.env };
  Object.assign(process.env, {
    JWT_SECRET: randomBytes(48).toString("hex"),
    NODE_ENV: "test",
    AUTH_DELIVERY_MODE: "test",
    GHARSEVA_DEMO: "true",
  });
  tables = new Map();
  routes = new Map();
  delivery = [];
  deliveryFails = false;
  useRealDelivery = false;
  identities = new Map();
  for (const model of [
    AuthSession,
    User,
    PendingLogin,
    ContactThrottle,
    ContactChallenge,
    ExternalIdentity,
    RegistrationSession,
    PasswordRecovery,
  ])
    persistence(model);
  for (const model of [PendingLogin, ContactChallenge])
    mock.method(model.prototype, "save", async function () {
      tables.get(model).push(this.toObject());
      return this;
    });
  const app = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (path, ...handlers) =>
          routes.set(method + path, handlers.at(-1)),
    },
  );
  mountPasswordLogin(app, {
    loginLimit: (_req, _res, next) => next(),
    sendLoginCode: async (...args) => {
      delivery.push(args);
      if (deliveryFails) throw new Error("test delivery failure");
      if (useRealDelivery) return deliverCode(...args);
    },
  });
  mountRegistration(app, {
    settings: async () => ({}),
    verifyIdentity: async (token) => {
      if (!identities.has(token))
        throw Object.assign(new Error("Invalid token"), { status: 401 });
      return identities.get(token);
    },
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env))
    if (!(key in savedEnvironment)) delete process.env[key];
  Object.assign(process.env, savedEnvironment);
});

test("password step binds email/mobile to registered email, with no session or protected access", async () => {
  for (const role of ["customer", "provider", "admin"]) {
    const user = await account(role);
    for (const identifier of [user.email, "+91 " + user.mobile]) {
      tables.get(ContactThrottle).length = 0;
      const pending = await begin(user, {
        identifier,
        email: "attacker@example.com",
      });
      assert.equal(pending.status, 202);
      assert.equal(pending.data.role, undefined);
      assert.equal(pending.cookies.has("gharseva_session"), false);
      assert.equal(delivery.at(-1)[0], "email");
      assert.equal(delivery.at(-1)[1], user.email);
      assert.notEqual(
        record().tokenHash,
        pending.cookies.get("gharseva_pending_login"),
      );
      const error = await new Promise((resolve) =>
        auth(
          {
            headers: {
              cookie:
                "gharseva_pending_login=" +
                pending.cookies.get("gharseva_pending_login"),
            },
          },
          {},
          resolve,
        ),
      );
      assert.equal(error.status, 401);
      const signed = await verify(pending);
      assert.equal(signed.status, 200);
      assert.equal(signed.data.role, role);
      assert.equal(signed.cookies.has("gharseva_session"), true);
      assert.equal(signed.data.passwordHash, undefined);
      if (role === "provider")
        assert.equal(signed.data.profile.status, "PENDING");
    }
  }
});

test("incorrect passwords create no challenge and standalone code paths refuse login", async () => {
  const user = await account();
  for (const extra of [{ password: "wrong" }]) {
    const r = await begin(user, extra);
    assert.ok([400, 401, 403].includes(r.status));
    assert.equal(r.cookies.has("gharseva_pending_login"), false);
  }
  assert.equal(record(), undefined);
  assert.equal(delivery.length, 0);
  const denied = await call("post", "/api/auth/code/request", {
    purpose: "login",
    channel: "email",
    contact: user.email,
  });
  assert.equal(denied.status, 400);
  const legacy = await ContactChallenge.create({
    purpose: "login",
    used: false,
    attempts: 0,
    expiresAt: new Date(Date.now() + 300000),
  });
  assert.equal(
    (
      await call("post", "/api/auth/code/check", {
        challengeId: String(legacy._id),
        code: "123456",
      })
    ).status,
    400,
  );
});

test("incorrect/expired/reused codes fail and concurrent verification consumes once", async () => {
  const p = await begin(await account());
  assert.equal((await verify(p, { code: "000000" })).status, 400);
  record().codeExpiresAt = new Date(0);
  assert.equal((await verify(p)).status, 400);
  record().codeExpiresAt = new Date(Date.now() + 300000);
  const results = await Promise.all([verify(p), verify(p), verify(p)]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal((await verify(p)).status, 401);
});

test("resend cooldown, old-code invalidation, attempt ceiling and absolute deadline are enforced", async () => {
  const p = await begin(await account());
  const deadline = record().expiresAt.getTime();
  assert.equal((await verify(p, { code: "000000" })).status, 400);
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/login/resend",
        { portal: "customer" },
        p.cookies,
      )
    ).status,
    429,
  );
  allowResend();
  const resent = await call(
    "post",
    "/api/auth/login/resend",
    { portal: "customer" },
    p.cookies,
  );
  assert.equal(resent.status, 200, JSON.stringify(resent.data));
  assert.notEqual(resent.data.demoCode, p.data.demoCode);
  assert.equal(record().attempts, 1);
  assert.equal(record().expiresAt.getTime(), deadline);
  assert.equal((await verify(p)).status, 400);
  for (let i = 0; i < 3; i++)
    assert.equal((await verify(p, { code: "000000" })).status, 400);
  assert.equal((await verify({ ...p, data: resent.data })).status, 401);
  const fresh = await begin(await account());
  record().expiresAt = new Date(0);
  assert.equal((await verify(fresh)).status, 401);
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/login/resend",
        { portal: "customer" },
        fresh.cookies,
      )
    ).status,
    401,
  );
});

test("password/contact/status/role/version changes and browser substitution invalidate proofs", async () => {
  for (const change of [
    { passwordHash: "changed" },
    { email: "new@example.com" },
    { mobile: "9876599999" },
    { status: "SUSPENDED" },
    { role: "admin" },
    { sessionVersion: 1 },
    { loginRevision: 1 },
  ]) {
    const user = await account();
    const p = await begin(user);
    Object.assign(
      tables.get(User).find((r) => same(r._id, user._id)),
      change,
    );
    assert.equal((await verify(p)).status, 401);
  }
  const p = await begin(await account());
  assert.equal((await verify(p, {}, new Map())).status, 401);
  const signed = await verify(p, { portal: "admin", role: "admin" });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.role, "customer");
  const fresh = await begin(await account());
  await call("delete", "/api/auth/login/pending", {}, fresh.cookies);
  assert.equal((await verify(fresh)).status, 401);
});

test("delivery failure, failed resend and missing SMTP never authenticate or reveal a live code", async () => {
  deliveryFails = true;
  const failed = await begin(await account());
  assert.equal(failed.status, 503);
  assert.equal(failed.cookies.has("gharseva_pending_login"), false);
  assert.equal(tables.get(PendingLogin).length, 0);
  deliveryFails = false;
  Object.assign(process.env, {
    AUTH_DELIVERY_MODE: "live",
    GHARSEVA_DEMO: "false",
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    SMTP_FROM: "test@example.test",
  });
  const p = await begin(await account());
  assert.equal(p.status, 202);
  assert.equal(p.data.demoCode, undefined);
  const old = delivery.at(-1)[2];
  allowResend();
  deliveryFails = true;
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/login/resend",
        { portal: "customer" },
        p.cookies,
      )
    ).status,
    503,
  );
  assert.equal((await verify(p, { code: old })).status, 400);
  delete process.env.SMTP_HOST;
  assert.equal((await begin(await account())).status, 503);
});

test("external mapping gives direct sign-in but preserves roles, suspensions and admin restrictions", async () => {
  for (const provider of ["google.com", "apple.com"]) {
    const user = await account("provider");
    identities.set(provider, {
      uid: provider,
      provider,
      contact: "unrelated@example.com",
    });
    await ExternalIdentity.create({ uid: provider, provider, user: user._id });
    const invoke = (portal) =>
      call("post", "/api/auth/external", {
        action: "login",
        idToken: provider,
        portal,
        email: "typed@example.com",
      });
    const signed = await invoke();
    assert.equal(signed.status, 200);
    assert.equal(signed.data.user.role, "provider");
    assert.equal(signed.data.user.profile.status, "PENDING");
    assert.equal(signed.cookies.has("gharseva_session"), true);
    assert.equal((await invoke("customer")).data.user.role, "provider");
    assert.equal((await invoke("admin")).data.user.role, "provider");
    tables.get(User).find((r) => same(r._id, user._id)).status = "SUSPENDED";
    assert.equal((await invoke()).status, 403);
  }
  assert.equal(
    (
      await call("post", "/api/auth/external", {
        action: "login",
        idToken: "forged",
        portal: "customer",
      })
    ).status,
    401,
  );
});

test("external onboarding never auto-merges; linking requires completed auth, password and Apple relay consent", async () => {
  const user = await account();
  const invoke = (token, extra = {}, cookies) =>
    call(
      "post",
      "/api/auth/external",
      { action: "login", idToken: token, portal: "customer", ...extra },
      cookies,
    );
  identities.set("collision", {
    uid: "collision",
    provider: "google.com",
    contact: user.email,
  });
  assert.equal((await invoke("collision")).status, 409);
  const p = await begin(user);
  assert.equal(
    (
      await invoke(
        "collision",
        { action: "link", currentPassword: "Example123!" },
        p.cookies,
      )
    ).status,
    401,
  );
  const signed = await verify(p);
  assert.equal(
    (
      await invoke(
        "collision",
        { action: "link", currentPassword: "wrong" },
        signed.cookies,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await invoke(
        "collision",
        { action: "link", currentPassword: "Example123!" },
        signed.cookies,
      )
    ).status,
    200,
  );
  assert.equal((await invoke("collision")).data.user._id, user._id);
  identities.set("relay", {
    uid: "relay",
    provider: "apple.com",
    contact: "new@privaterelay.appleid.com",
  });
  const unknown = await invoke("relay");
  assert.equal(unknown.data.onboarding, true);
  assert.equal(unknown.cookies.has("gharseva_session"), false);
  assert.equal(tables.get(User).length, 1);
  assert.equal(
    (
      await invoke(
        "relay",
        { action: "link", currentPassword: "Example123!" },
        signed.cookies,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await invoke(
        "relay",
        {
          action: "link",
          currentPassword: "Example123!",
          appleRelayConsent: true,
        },
        signed.cookies,
      )
    ).status,
    200,
  );
});

test("verified external claims enforce enabled provider, verified email and recent authentication", () => {
  const claims = {
    uid: "u",
    email: "user@example.com",
    email_verified: true,
    auth_time: Date.now() / 1000,
    firebase: { sign_in_provider: "google.com" },
  };
  assert.equal(externalIdentityFromClaims(claims, { google: true }).uid, "u");
  for (const [change, enabled] of [
    [{}, false],
    [{ email_verified: false }, true],
    [{ auth_time: 0 }, true],
    [{ auth_time: undefined }, true],
    [{ uid: undefined }, true],
  ]) {
    assert.throws(() =>
      externalIdentityFromClaims({ ...claims, ...change }, { google: enabled }),
    );
  }
});

test("registration verification and recovery keep restricted purposes and never issue login sessions", async () => {
  const registration = await call("post", "/api/auth/code/request", {
    purpose: "register",
    channel: "email",
    contact: "new-registration@example.com",
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.data));
  assert.equal(tables.get(ContactChallenge).at(-1).deliveryEligible, true);
  const registered = await call("post", "/api/auth/code/check", {
    challengeId: String(registration.data.challengeId),
    code: registration.data.demoCode,
  });
  assert.equal(registered.status, 200, JSON.stringify(registered.data));
  assert.equal(registered.cookies.has("gharseva_registration"), true);
  assert.equal(registered.cookies.has("gharseva_session"), false);
  const user = await account();
  tables.get(User).find((r) => same(r._id, user._id)).verification = {
    email: { at: new Date(), mode: "demo" },
  };
  const recovery = await call("post", "/api/auth/code/request", {
    purpose: "recover",
    portal: "customer",
    channel: "email",
    contact: user.email,
  });
  assert.equal(recovery.status, 201, JSON.stringify(recovery.data));
  const checked = await call("post", "/api/auth/code/check", {
    challengeId: String(recovery.data.challengeId),
    code: recovery.data.demoCode,
    portal: "customer",
  });
  assert.equal(checked.status, 200, JSON.stringify(checked.data));
  assert.equal(checked.cookies.has("gharseva_recovery"), true);
  assert.equal(checked.cookies.has("gharseva_session"), false);
});

test("new Apple relay domain also needs consent and records it only after authenticated linking", async () => {
  const user = await account(),
    p = await begin(user),
    signed = await verify(p);
  identities.set("new-domain", {
    uid: "new-domain",
    provider: "apple.com",
    contact: "relay@private.icloud.com",
  });
  const body = {
    action: "link",
    portal: "customer",
    currentPassword: "Example123!",
    idToken: "new-domain",
  };
  assert.equal(
    (await call("post", "/api/auth/external", body, signed.cookies)).status,
    400,
  );
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/external",
        { ...body, appleRelayConsent: true },
        signed.cookies,
      )
    ).status,
    200,
  );
  assert.ok(
    tables.get(User).find((r) => same(r._id, user._id)).appleRelayConsentAt,
  );
});

test("forged login role/portal fields never choose permissions; all roles share one challenge flow", async () => {
  for (const storedRole of ["customer", "provider", "admin"]) {
    for (const claimed of [
      undefined,
      "customer",
      "provider",
      "admin",
      "owner",
      { role: "admin" },
    ]) {
      const user = await account(storedRole),
        pending = await begin(user, { portal: claimed, role: "admin" });
      assert.equal(pending.status, 202);
      assert.equal(record().portal, storedRole);
      assert.equal(pending.data.role, undefined);
      assert.equal(pending.cookies.has("gharseva_session"), false);
      const signed = await verify(pending, {
        portal: "not-a-role",
        role: "admin",
        userId: "another-account",
      });
      assert.equal(signed.status, 200);
      assert.equal(signed.data.role, storedRole);
      assert.equal(String(signed.data._id), String(user._id));
      assert.equal(authDestination(signed.data), "/dashboard/" + storedRole);
      const req = {
        headers: {
          cookie: "gharseva_session=" + signed.cookies.get("gharseva_session"),
        },
      };
      const authError = await new Promise((resolve) => auth(req, {}, resolve));
      assert.equal(authError, undefined);
      const denied = await new Promise((resolve) =>
        requireRole("admin")(req, {}, resolve),
      );
      assert.equal(denied?.status, storedRole === "admin" ? undefined : 403);
    }
  }
});
test("suspension before password proof never delivers a code or creates a session", async () => {
  const user = await account();
  tables.get(User)[0].status = "SUSPENDED";
  const r = await begin(user);
  assert.equal(r.status, 403);
  assert.equal(delivery.length, 0);
  assert.equal(record(), undefined);
  assert.equal(r.cookies.has("gharseva_session"), false);
});
test("linked Google/Apple customer identities need no portal; admin mappings remain prohibited", async () => {
  for (const provider of ["google.com", "apple.com"]) {
    for (const storedRole of ["customer", "admin"]) {
      const user = await account(storedRole),
        uid = provider + storedRole;
      identities.set(uid, { uid, provider, contact: "other@example.com" });
      await ExternalIdentity.create({ uid, provider, user: user._id });
      const r = await call("post", "/api/auth/external", {
        action: "login",
        idToken: uid,
        role: "admin",
        portal: "admin",
      });
      assert.equal(r.status, storedRole === "admin" ? 403 : 200);
      assert.equal(r.cookies.has("gharseva_session"), storedRole !== "admin");
      if (storedRole !== "admin") assert.equal(r.data.user.role, storedRole);
    }
  }
});
test("return destinations and alias state only allow internal role-appropriate routes", () => {
  const booking = "/booking/0123456789abcdef01234567?service=plumbing",
    assistant = "/assistant?service=plumbing&provider=0123456789abcdef01234567";
  for (const role of ["customer", "provider", "admin"]) {
    const user = { role },
      home = "/dashboard/" + role;
    assert.equal(authDestination(user), home);
    for (const requested of [booking, assistant, "/finder"])
      assert.equal(
        authDestination(user, requested),
        role === "customer" ? requested : home,
      );
    assert.equal(
      authDestination(user, home + "?section=bookings"),
      home + "?section=bookings",
    );
    for (const requested of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/dashboard/admin-other",
      "/dashboard/provider/anything",
      "/booking/%2f%2fevil.example",
      "/dashboard/customer%0d%0aLocation:evil",
      {},
      null,
    ])
      assert.equal(authDestination(user, requested), home);
    for (const other of ["customer", "provider", "admin"].filter(
      (x) => x !== role,
    ))
      assert.equal(authDestination(user, "/dashboard/" + other), home);
  }
  assert.deepEqual(
    loginAliasState({ from: booking, role: "admin", untrusted: "discard" }),
    { from: booking },
  );
  assert.equal(loginAliasState({ from: "https://evil.example" }), undefined);
  assert.equal(safeReturnPath("/unknown"), undefined);
  assert.throws(() => checkStoredLoginRole({ role: "owner" }));
  assert.throws(() => checkStoredLoginRole({ role: "admin" }, true));
});
test("shared password recovery retains verified public-account eligibility and excludes administrators", async () => {
  for (const storedRole of ["customer", "provider", "admin"]) {
    const user = await account(storedRole);
    tables.get(User).find((r) => same(r._id, user._id)).verification = {
      email: { at: new Date(), mode: "demo" },
    };
    const sent = await call("post", "/api/auth/code/request", {
      purpose: "recover",
      channel: "email",
      contact: user.email,
    });
    assert.equal(sent.status, 201);
    const checked = await call("post", "/api/auth/code/check", {
      challengeId: String(sent.data.challengeId),
      code: sent.data.demoCode,
    });
    assert.equal(checked.status, storedRole === "admin" ? 401 : 200);
    assert.equal(checked.cookies.has("gharseva_session"), false);
    assert.equal(
      checked.cookies.has("gharseva_recovery"),
      storedRole !== "admin",
    );
  }
  for (const changed of [{ verification: {} }, { status: "SUSPENDED" }]) {
    const user = await account();
    Object.assign(
      tables.get(User).find((r) => same(r._id, user._id)),
      { verification: { email: { at: new Date(), mode: "demo" } } },
      changed,
    );
    const sent = await call("post", "/api/auth/code/request", {
      purpose: "recover",
      channel: "email",
      contact: user.email,
    });
    assert.equal(sent.status, 201);
    const checked = await call("post", "/api/auth/code/check", {
      challengeId: String(sent.data.challengeId),
      code: sent.data.demoCode,
    });
    assert.equal(checked.status, 401);
    assert.equal(checked.cookies.has("gharseva_recovery"), false);
    assert.equal(checked.cookies.has("gharseva_session"), false);
  }
});

function useBrevo() {
  useRealDelivery = true;
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_DELIVERY_MODE: "live",
    GHARSEVA_DEMO: "false",
    EMAIL_TRANSPORT: "brevo",
    BREVO_API_KEY: "fixture-key-no-real-account",
    EMAIL_FROM_ADDRESS: "sender@example.test",
  });
  for (const key of Object.keys(process.env))
    if (/^(SMTP_|TWILIO_)/.test(key)) delete process.env[key];
}
const bodyCode = (body) => body.textContent.match(/code is (\d{6})/)[1];

test("real Brevo adapter wiring: all stored roles and mobile/password identifiers require email OTP before session", async () => {
  useBrevo();
  const outbound = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    outbound.push(JSON.parse(init.body));
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  for (const storedRole of ["customer", "provider", "admin"]) {
    const user = await account(storedRole);
    const pending = await begin(user, {
      identifier: "+91 " + user.mobile,
      email: "attacker@example.test",
    });
    assert.equal(pending.status, 202);
    const sent = outbound.at(-1),
      code = bodyCode(sent);
    assert.deepEqual(sent.to, [{ email: user.email }]);
    assert.equal(pending.data.demoCode, undefined);
    assert.ok(!JSON.stringify(pending.data).includes(code));
    assert.equal(pending.cookies.has("gharseva_session"), false);
    const signed = await verify(pending, { code });
    assert.equal(signed.status, 200);
    assert.equal(signed.data.role, storedRole);
    assert.equal((await verify(pending, { code })).status, 401);
  }
});

test("registration and recovery use the same selected Brevo delivery and never authenticate from API acceptance", async () => {
  useBrevo();
  const outbound = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    outbound.push(JSON.parse(init.body));
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  const user = await account();
  tables.get(User)[0].verification = {
    email: { at: new Date(), mode: "live" },
  };
  for (const purpose of ["register", "recover"]) {
    tables.get(ContactThrottle).length = 0;
    const sent = await call("post", "/api/auth/code/request", {
      purpose,
      channel: "email",
      contact: user.email,
    });
    assert.equal(sent.status, 201);
    const code = bodyCode(outbound.at(-1));
    assert.equal(sent.data.demoCode, undefined);
    assert.ok(!JSON.stringify(sent.data).includes(code));
    assert.equal(sent.cookies.has("gharseva_session"), false);
    const result = await call("post", "/api/auth/code/check", {
      challengeId: String(sent.data.challengeId),
      code,
    });
    assert.equal(result.status, 200);
    assert.equal(result.cookies.has("gharseva_session"), false);
    assert.equal(
      result.cookies.has(
        purpose === "register" ? "gharseva_registration" : "gharseva_recovery",
      ),
      true,
    );
  }
});

test("provider timeout/rejection in login, registration and recovery leaves no usable proof or authenticated session", async () => {
  useBrevo();
  const user = await account();
  tables.get(User)[0].verification = {
    email: { at: new Date(), mode: "live" },
  };
  const outbound = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    outbound.push(JSON.parse(init.body));
    throw new DOMException("provider private error", "TimeoutError");
  });
  const login = await begin(user);
  assert.equal(login.status, 503);
  assert.equal(login.cookies.has("gharseva_session"), false);
  assert.equal(tables.get(PendingLogin).length, 0);
  for (const purpose of ["register", "recover"]) {
    tables.get(ContactThrottle).length = 0;
    const result = await call("post", "/api/auth/code/request", {
      purpose,
      channel: "email",
      contact: user.email,
    });
    assert.equal(result.status, 503);
    assert.equal(result.cookies.has("gharseva_session"), false);
    assert.equal(result.data.demoCode, undefined);
    assert.equal(tables.get(ContactChallenge).length, 0);
    assert.ok(!JSON.stringify(result.data).includes(bodyCode(outbound.at(-1))));
    assert.ok(!JSON.stringify(result.data).includes("private"));
  }
});

test("an in-flight Brevo message cannot complete registration before acceptance, and cooldown prevents competing codes", async () => {
  useBrevo();
  let signalSent, release, sent;
  const started = new Promise((resolve) => {
    signalSent = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  mock.method(globalThis, "fetch", async (_url, init) => {
    sent = JSON.parse(init.body);
    signalSent();
    await gate;
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  const body = {
    purpose: "register",
    channel: "email",
    contact: "new@example.test",
  };
  const pending = call("post", "/api/auth/code/request", body);
  await started;
  const challenge = tables.get(ContactChallenge).at(-1);
  const proof = { challengeId: String(challenge._id), code: bodyCode(sent) };
  assert.equal((await call("post", "/api/auth/code/check", proof)).status, 400);
  assert.equal(
    (await call("post", "/api/auth/code/request", body)).status,
    429,
  );
  release();
  assert.equal((await pending).status, 201);
  const results = await Promise.all([
    call("post", "/api/auth/code/check", proof),
    call("post", "/api/auth/code/check", proof),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test("uncertain Brevo resend invalidates both old and unaccepted new proof, without retries or live code disclosure", async () => {
  useBrevo();
  const outbound = [];
  let failDelivery = false;
  mock.method(globalThis, "fetch", async (_url, init) => {
    outbound.push(JSON.parse(init.body));
    if (failDelivery) throw new DOMException("timeout", "TimeoutError");
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  const pending = await begin(await account()),
    old = bodyCode(outbound[0]);
  allowResend();
  failDelivery = true;
  const r = await call("post", "/api/auth/login/resend", {}, pending.cookies);
  assert.equal(r.status, 503);
  const fresh = bodyCode(outbound[1]);
  assert.notEqual(old, fresh);
  for (const code of [old, fresh])
    assert.equal((await verify(pending, { code })).status, 400);
  assert.equal(
    (await call("post", "/api/auth/login/resend", {}, pending.cookies)).status,
    429,
  );
  assert.equal(outbound.length, 2);
});

test("live Brevo contact codes preserve expiry, five-attempt limit and replacement invalidation", async () => {
  useBrevo();
  let sent;
  mock.method(globalThis, "fetch", async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  for (const scenario of ["expired", "attempts", "replacement"]) {
    const body = {
      purpose: "register",
      channel: "email",
      contact: scenario + "@example.test",
    };
    const result = await call("post", "/api/auth/code/request", body);
    const proof = {
      challengeId: String(result.data.challengeId),
      code: bodyCode(sent),
    };
    const row = tables.get(ContactChallenge).at(-1);
    if (scenario === "expired") row.expiresAt = new Date(0);
    if (scenario === "attempts") {
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await call("post", "/api/auth/code/check", {
              ...proof,
              code: "000000",
            })
          ).status,
          400,
        );
    }
    if (scenario === "replacement") {
      for (const r of tables.get(ContactThrottle))
        r.nextAllowedAt = new Date(0);
      assert.equal(
        (await call("post", "/api/auth/code/request", body)).status,
        201,
      );
    }
    assert.equal(
      (await call("post", "/api/auth/code/check", proof)).status,
      400,
    );
  }
});

test("late provider acceptance cannot revive a contact challenge that expired during delivery", async () => {
  useBrevo();
  mock.method(globalThis, "fetch", async () => {
    tables.get(ContactChallenge).at(-1).expiresAt = new Date(0);
    return Response.json(
      { messageId: "<accepted@fixture.test>" },
      { status: 201 },
    );
  });
  const result = await call("post", "/api/auth/code/request", {
    purpose: "register",
    channel: "email",
    contact: "new@example.test",
  });
  assert.equal(result.status, 409);
  assert.equal(result.data.challengeId, undefined);
  assert.equal(result.cookies.has("gharseva_session"), false);
  assert.equal(tables.get(ContactChallenge).length, 0);
});

test("selected-provider mismatch and forged role/email fields cannot change account identity", async () => {
  const user = await account("customer");
  Object.assign(tables.get(User)[0], { city: "Vadodara" });
  user.city = "Vadodara";
  user.termsAcceptedAt = new Date(2020, 1, 1);
  user.verification = { email: { mode: "live", at: new Date() } };
  identities.set("stable", {
    uid: "stable",
    provider: "google.com",
    contact: "trusted@example.test",
  });
  await ExternalIdentity.create({
    uid: "stable",
    provider: "google.com",
    user: user._id,
  });
  assert.equal(
    (
      await call("post", "/api/auth/external", {
        action: "login",
        idToken: "stable",
        provider: "apple",
      })
    ).status,
    401,
  );
  const result = await call("post", "/api/auth/external", {
    action: "login",
    idToken: "stable",
    provider: "google",
    role: "admin",
    email: "forged@example.test",
    city: "Ahmedabad",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.role, "customer");
  assert.equal(result.data.user.email, user.email);
  assert.equal(result.data.user.city, "Vadodara");
  assert.equal(tables.get(User)[0].passwordHash, user.passwordHash);
});
test("concurrent first social sign-ins create onboarding proof, never an application account/session", async () => {
  identities.set("new", {
    uid: "new",
    provider: "apple.com",
    contact: "anonymous@privaterelay.appleid.com",
    name: "",
  });
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      call("post", "/api/auth/external", {
        action: "login",
        idToken: "new",
        provider: "apple",
        role: "admin",
        email: "forged@example.test",
      }),
    ),
  );
  assert.ok(
    results.every((r) => r.status === 200 && r.data.onboarding === true),
  );
  assert.ok(results.every((r) => !r.cookies.has("gharseva_session")));
  assert.ok(
    results.every(
      (r) => r.data.identity.contact === "anonymous@privaterelay.appleid.com",
    ),
  );
  assert.equal(tables.get(User).length, 0);
  assert.equal(tables.get(AuthSession).length, 0);
});
test("concurrent linking is idempotent; adding a provider to the same UID requires explicit password proof and relay consent", async () => {
  const user = await account(),
    logged = await verify(await begin(user));
  identities.set("google", {
    uid: "common-uid",
    provider: "google.com",
    contact: user.email,
  });
  const link = (token, extra = {}) =>
    call(
      "post",
      "/api/auth/external",
      {
        action: "link",
        idToken: token,
        currentPassword: "Example123!",
        ...extra,
      },
      logged.cookies,
    );
  const rs = await Promise.all([link("google"), link("google")]);
  assert.ok(
    rs.every((r) => r.status === 200),
    JSON.stringify(rs),
  );
  assert.equal(tables.get(ExternalIdentity).length, 1);
  identities.set("apple", {
    uid: "common-uid",
    provider: "apple.com",
    contact: "anonymous@privaterelay.appleid.com",
  });
  const login = () =>
    call("post", "/api/auth/external", {
      action: "login",
      idToken: "apple",
      provider: "apple",
    });
  assert.equal((await login()).status, 403);
  assert.equal((await link("apple")).status, 400);
  assert.equal(
    (await link("apple", { currentPassword: "wrong", appleRelayConsent: true }))
      .status,
    401,
  );
  assert.equal((await link("apple", { appleRelayConsent: true })).status, 200);
  assert.equal((await link("apple", { appleRelayConsent: true })).status, 200);
  assert.deepEqual(tables.get(ExternalIdentity)[0].additionalProviders, [
    "apple.com",
  ]);
  assert.equal((await login()).data.user._id, user._id);
  assert.equal(tables.get(User)[0].email, user.email);
});
test("link ownership, administrator boundary and provider documents/approval remain stored decisions", async () => {
  const pending = await account("provider"),
    admin = await account("admin"),
    other = await account();
  const saved = tables
    .get(User)
    .find((u) => String(u._id) === String(pending._id));
  Object.assign(saved, {
    city: "Surat",
    profile: {
      status: "PENDING",
      documents: ["fixture-private-document"],
      city: "Surat",
      price: 499,
    },
  });
  identities.set("pending", {
    uid: "pending",
    provider: "apple.com",
    contact: "relay@privaterelay.appleid.com",
  });
  await ExternalIdentity.create({
    uid: "pending",
    provider: "apple.com",
    user: pending._id,
  });
  const original = JSON.stringify(saved);
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await call("post", "/api/auth/external", {
          action: "login",
          idToken: "pending",
          provider: "apple",
          role: "admin",
          name: "replace",
          city: "Ahmedabad",
        })
      ).status,
      200,
    );
  assert.equal(JSON.stringify(saved), original);
  const ownerLogin = await verify(await begin(other));
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/external",
        {
          action: "link",
          idToken: "pending",
          currentPassword: "Example123!",
          appleRelayConsent: true,
        },
        ownerLogin.cookies,
      )
    ).status,
    409,
  );
  const adminLogin = await verify(await begin(admin));
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/external",
        {
          action: "link",
          idToken: "pending",
          currentPassword: "Example123!",
          appleRelayConsent: true,
        },
        adminLogin.cookies,
      )
    ).status,
    403,
  );
});
async function completeSocialCustomer(overrides = {}) {
  const token = "a".repeat(64),
    cookieToken = createHash("sha256").update(token).digest("hex");
  if (!tables.get(RegistrationSession).some((s) => s.tokenHash === cookieToken))
    await RegistrationSession.create({
      tokenHash: cookieToken,
      channel: "email",
      contact: "new-social@example.test",
      mode: "live",
      externalUid: "new-social-uid",
      externalProvider: "google.com",
      expiresAt: new Date(Date.now() + 600000),
    });
  const app = createApp(),
    route = app.router.stack.find(
      (layer) => layer.route?.path === "/api/auth/register",
    ).route;
  const req = {
    body: {
      role: "customer",
      name: "New Social Customer",
      email: "new-social@example.test",
      mobile: "9876599001",
      password: "ChosenPassword123!",
      city: " Ahemdabad ",
      terms: true,
      verifiedRegistration: true,
      ...overrides,
    },
    headers: { cookie: "gharseva_registration=" + token },
    is: () => false,
  };
  const result = { status: 200, cookies: new Map() };
  const res = {
    cookie: (k, v) => result.cookies.set(k, v),
    clearCookie: (k) => result.cookies.delete(k),
    status: (v) => {
      result.status = v;
      return res;
    },
    json: (v) => {
      result.data = v;
      return res;
    },
  };
  try {
    await route.stack.at(-1).handle(req, res);
  } catch (error) {
    result.status = error.status || (error.code === 11000 ? 409 : 500);
    result.error = error.message;
  }
  return result;
}
test("actual social registration handler validates city, consent, contact and role without invented credentials", async () => {
  for (const invalid of [
    { city: "" },
    { city: "not-a-city" },
    { terms: false },
    { role: "admin" },
    { email: "forged@example.test" },
  ]) {
    const result = await completeSocialCustomer(invalid);
    assert.equal(result.status, 400, JSON.stringify(result));
    assert.equal(tables.get(User).length, 0);
  }
  const created = await completeSocialCustomer();
  assert.equal(created.status, 201, JSON.stringify(created));
  assert.equal(created.data.city, "Ahmedabad");
  assert.equal(created.data.role, "customer");
  assert.equal(created.data.verification.email.mode, "live");
  assert.ok(
    await bcrypt.compare(
      "ChosenPassword123!",
      tables.get(User)[0].passwordHash,
    ),
  );
  assert.equal(tables.get(ExternalIdentity).length, 1);
  assert.equal(created.cookies.has("gharseva_session"), true);
});
test("actual concurrent first registration keeps one account and binding, and preserves its chosen password", async () => {
  const rs = await Promise.all([
    completeSocialCustomer(),
    completeSocialCustomer(),
  ]);
  assert.equal(
    rs.filter((r) => r.status === 201).length,
    1,
    JSON.stringify(rs),
  );
  assert.equal(tables.get(User).length, 1);
  assert.equal(tables.get(ExternalIdentity).length, 1);
  assert.ok(
    await bcrypt.compare(
      "ChosenPassword123!",
      tables.get(User)[0].passwordHash,
    ),
  );
});

test("linking identifying Google credentials to an existing Apple relay account requires fresh explicit consent", async () => {
  const user = await account(),
    stored = tables.get(User)[0];
  stored.email = "existing@privaterelay.appleid.com";
  user.email = stored.email;
  const logged = await verify(await begin(user));
  identities.set("identifying-google", {
    uid: "identifying-google",
    provider: "google.com",
    contact: "identifying@example.test",
  });
  const body = {
    action: "link",
    idToken: "identifying-google",
    provider: "google",
    currentPassword: "Example123!",
  };
  assert.equal(
    (await call("post", "/api/auth/external", body, logged.cookies)).status,
    400,
  );
  assert.equal(tables.get(ExternalIdentity).length, 0);
  assert.equal(
    (
      await call(
        "post",
        "/api/auth/external",
        { ...body, appleRelayConsent: true },
        logged.cookies,
      )
    ).status,
    200,
  );
  assert.equal(stored.email, user.email);
});
