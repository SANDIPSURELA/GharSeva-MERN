import { sessionFetch } from "./session-fixture.js";
import { fixtureLogin } from "./login-fixture.js";
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { seed } from "../src/seed.js";
import {
  User,
  AuthSession,
  Booking,
  ContactChallenge,
  ContactThrottle,
  PasswordRecovery,
  PendingLogin,
  ExternalIdentity,
  RegistrationSession,
} from "../src/models.js";
import {
  externalIdentityFromClaims,
  verifyExternal,
} from "../src/identity-services.js";
import { checkStoredLoginRole } from "../src/login-policy.js";
let db,
  server,
  url,
  serial = 0;
let deliveryFails = false,
  deliveries = [],
  externalIdentities = new Map();
const oldPassword = "Original123!",
  newPassword = "Replacement456!";
async function call(
  path,
  { body, method = body ? "POST" : "GET", jar = new Map() } = {},
) {
  const r = await sessionFetch(url + path, {
    method,
    headers: {
      "X-GharSeva": "1",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join(";"),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookies = r.headers.getSetCookie();
  for (const c of cookies) {
    const first = c.split(";")[0],
      i = first.indexOf("=");
    if (first.slice(i + 1)) jar.set(first.slice(0, i), first.slice(i + 1));
    else jar.delete(first.slice(0, i));
  }
  return { status: r.status, data: await r.json(), jar, cookies };
}
async function signIn({ body }) {
  return fixtureLogin(url, body);
}
async function account(role = "customer", overrides = {}) {
  serial++;
  return User.create({
    name: "Login Test Person",
    email: `login-${serial}@example.com`,
    mobile: `97666${String(serial).padStart(5, "0")}`,
    passwordHash: await bcrypt.hash(oldPassword, 4),
    role,
    verification: {
      email: { at: new Date(), mode: "demo" },
      mobile: { at: new Date(), mode: "demo" },
    },
    ...(role === "provider"
      ? { profile: { category: "plumbing", status: "PENDING" } }
      : {}),
    ...overrides,
  });
}
async function challenge(
  user,
  { purpose = "recover", channel = "email", portal = user.role } = {},
) {
  const sent = await call("/auth/code/request", {
    body: {
      purpose,
      channel,
      contact: channel === "mobile" ? `+91 ${user.mobile}` : user.email,
      portal,
    },
  });
  assert.equal(sent.status, 201);
  return sent.data;
}
async function recovery(user, options = {}) {
  const c = await challenge(user, options);
  const checked = await call("/auth/code/check", {
    body: {
      challengeId: c.challengeId,
      code: c.demoCode,
      portal: options.portal || user.role,
    },
  });
  assert.equal(checked.status, 200);
  assert.ok(checked.data.recovery);
  return checked;
}
const reset = (jar, password = newPassword) =>
  call("/auth/password/reset", {
    jar,
    body: { newPassword: password, confirmPassword: password },
  });
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_GOOGLE_ENABLED = "false";
  process.env.AUTH_APPLE_ENABLED = "false";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.GHARSEVA_DEMO = "true";
  process.env.AUTH_DELIVERY_MODE = "test";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.SEED_CUSTOMER_PASSWORD = "Customer123";
  process.env.SEED_PROVIDER_PASSWORD = "Provider123";
  process.env.SEED_ADMIN_PASSWORD = "Admin12345";
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
  await mongoose.connect(db.getUri());
  await Promise.all([
    User.init(),
    Booking.init(),
    ContactThrottle.init(),
    PasswordRecovery.init(),
    PendingLogin.init(),
    ExternalIdentity.init(),
  ]);
  await seed();
});
beforeEach(async () => {
  deliveryFails = false;
  deliveries = [];
  externalIdentities = new Map();
  server = createApp({
    identityServices: {
      deliverCode: async (...args) => {
        deliveries.push(args);
        if (deliveryFails) throw new Error("delivery unavailable");
      },
      verifyExternal: async (token) => {
        if (externalIdentities.has(token)) return externalIdentities.get(token);
        return verifyExternal(token);
      },
    },
  }).listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}/api`;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
});
after(async () => {
  await mongoose.disconnect();
  await db.stop();
});

test("email recovery only resets the password, revokes sessions, requires confirmation and is single use", async () => {
  const p = await account();
  const prior = [];
  for (let i = 0; i < 2; i++)
    prior.push(
      (await fixtureLogin(url, { identifier: p.email, password: oldPassword }))
        .jar,
    );
  const proof = await recovery(p);
  assert.match(proof.cookies.join(";"), /HttpOnly/);
  assert.equal(proof.jar.has("gharseva_session"), false);
  assert.equal((await call("/auth/me", { jar: proof.jar })).status, 401);
  const stored = await PasswordRecovery.findOne({ user: p._id }).select(
    "+tokenHash",
  );
  assert.notEqual(stored.tokenHash, proof.jar.get("gharseva_recovery"));
  assert.equal(
    (
      await call("/auth/password/reset", {
        jar: proof.jar,
        body: { newPassword, confirmPassword: "Mismatch123" },
      })
    ).status,
    400,
  );
  assert.equal((await reset(proof.jar)).status, 200);
  for (const jar of prior)
    assert.equal((await call("/auth/me", { jar })).status, 401);
  assert.equal(
    (
      await signIn({
        body: {
          identifier: p.email,
          password: oldPassword,
          portal: "customer",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await signIn({
        body: {
          identifier: p.email,
          password: newPassword,
          portal: "customer",
        },
      })
    ).status,
    200,
  );
  assert.equal((await reset(proof.jar)).status, 401);
  assert.equal(await PasswordRecovery.countDocuments({ user: p._id }), 0);
});
test("mobile recovery supports legacy version-zero providers and keeps approval pending", async () => {
  const p = await account("provider");
  await User.collection.updateOne(
    { _id: p._id },
    { $unset: { sessionVersion: "" } },
  );
  const proof = await recovery(p, { channel: "mobile" });
  assert.equal((await reset(proof.jar)).status, 200);
  const r = await signIn({
    body: { identifier: p.mobile, password: newPassword, portal: "provider" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.status, "PENDING");
  assert.equal(r.data.role, "provider");
  assert.equal((await User.findById(p._id)).sessionVersion, 1);
});
test("unknown, unverified, suspended and admin contacts receive generic replies and cannot recover", async () => {
  const people = [
    await account("customer", { verification: {} }),
    await account("provider", { status: "SUSPENDED" }),
    await account("admin"),
    {
      email: "unknown-recovery@example.com",
      mobile: "9766699999",
      role: "customer",
    },
  ];
  let shape;
  for (const p of people) {
    const c = await challenge(p, {
      portal: p.role === "admin" ? "customer" : p.role,
    });
    shape ??= Object.keys(c).sort();
    assert.deepEqual(Object.keys(c).sort(), shape);
    const checked = await call("/auth/code/check", {
      body: {
        challengeId: c.challengeId,
        code: c.demoCode,
        portal: p.role === "admin" ? "customer" : p.role,
      },
    });
    assert.equal(checked.status, 401);
    assert.equal(checked.jar.has("gharseva_recovery"), false);
  }
});
test("expired proof, changed contacts, suspended accounts and disabled demo mode invalidate recovery", async () => {
  const expired = await account();
  const first = await recovery(expired);
  await PasswordRecovery.updateMany(
    { user: expired._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await reset(first.jar)).status, 401);
  const changed = await account();
  const second = await recovery(changed);
  await User.updateOne(
    { _id: changed._id },
    { $set: { email: "changed-recovery@example.com" } },
  );
  assert.equal((await reset(second.jar)).status, 401);
  const suspended = await account();
  const third = await recovery(suspended);
  await User.updateOne(
    { _id: suspended._id },
    { $set: { status: "SUSPENDED" } },
  );
  assert.equal((await reset(third.jar)).status, 401);
  const demo = await account();
  const fourth = await recovery(demo);
  process.env.GHARSEVA_DEMO = "false";
  try {
    assert.equal((await reset(fourth.jar)).status, 401);
  } finally {
    process.env.GHARSEVA_DEMO = "true";
  }
});
test("two recovery sessions cannot concurrently replace the same password twice", async () => {
  const p = await account();
  const a = await recovery(p, { channel: "email" }),
    b = await recovery(p, { channel: "mobile" });
  const variants = ["WinnerOne123!", "WinnerTwo123!"];
  const results = await Promise.all([
    reset(a.jar, variants[0]),
    reset(b.jar, variants[1]),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [401, 409].includes(r.status)));
  const winner = results.findIndex((r) => r.status === 200);
  assert.equal(
    (
      await signIn({
        body: { identifier: p.email, password: variants[winner] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await signIn({
        body: { identifier: p.email, password: variants[1 - winner] },
      })
    ).status,
    401,
  );
  assert.equal((await User.findById(p._id)).sessionVersion, 1);
});
test("password reset invalidates outstanding login codes and regular password changes revoke recovery", async () => {
  const p = await account();
  const pending = await begin(p);
  const proof = await recovery(p);
  assert.equal((await reset(proof.jar)).status, 200);
  assert.equal((await verify(pending)).status, 401);
  const q = await account();
  const current = await signIn({
    body: { identifier: q.email, password: oldPassword },
  });
  const recover = await recovery(q);
  assert.equal(
    (
      await call("/auth/change-password", {
        jar: current.jar,
        body: { currentPassword: oldPassword, newPassword },
      })
    ).status,
    200,
  );
  assert.equal((await reset(recover.jar)).status, 401);
});
test("external entry uses the same role policy and reset cannot run without dedicated proof", async () => {
  for (const role of ["customer", "provider"])
    assert.doesNotThrow(() => checkStoredLoginRole({ role }, true));
  assert.throws(() => checkStoredLoginRole({ role: "admin" }, true));
  const blocked = await call("/auth/external", {
    body: { idToken: "not-a-live-token", action: "login", portal: "admin" },
  });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.jar.has("gharseva_session"), false);
  assert.equal((await reset(new Map())).status, 401);
});

async function begin(
  user,
  {
    identifier = user.email,
    portal,
    password = oldPassword,
    jar = new Map(),
    ...extra
  } = {},
) {
  const sent = await call("/auth/login", {
    jar,
    body: { identifier, password, portal, ...extra },
  });
  assert.equal(sent.status, 202, JSON.stringify(sent.data));
  assert.equal(sent.data.pending, true);
  assert.equal(sent.data.role, undefined);
  assert.equal(sent.data._id, undefined);
  assert.equal(sent.jar.has("gharseva_session"), false);
  return { ...sent, portal, user };
}
const verify = (pending, overrides = {}, jar = new Map(pending.jar)) =>
  call("/auth/login/verify", {
    jar,
    body: { code: pending.data.demoCode, ...overrides },
  });
async function allowResend(pending) {
  await PendingLogin.updateMany(
    { user: pending.user._id },
    { $set: { nextSendAt: new Date(0) } },
  );
  await ContactThrottle.updateMany(
    { _id: /^password-login:/ },
    { $set: { nextAllowedAt: new Date(0) } },
  );
}

test("all existing demo accounts complete password plus email OTP by email and +91 mobile, including admin", async () => {
  const people = await User.find({ email: /@gharseva\.com$/ });
  assert.equal(people.length, 14);
  for (const person of people) {
    const password =
      person.role === "admin"
        ? "Admin12345"
        : person.role === "provider"
          ? "Provider123"
          : "Customer123";
    for (const identifier of [person.email, "+91 " + person.mobile]) {
      const signed = await fixtureLogin(url, {
        identifier,
        password,
        portal: person.role,
      });
      assert.equal(signed.status, 200);
      assert.equal(signed.data.role, person.role);
      assert.equal(signed.data.passwordHash, undefined);
      assert.equal(signed.data.loginRevision, undefined);
      assert.equal(
        (await call("/auth/me", { jar: signed.jar })).data._id,
        String(person._id),
      );
    }
  }
});

test("email and mobile passwords send only to the registered email and deny protected APIs until verification", async () => {
  for (const identifierType of ["email", "mobile"]) {
    const user = await account("provider", { verification: {} });
    const pending = await begin(user, {
      identifier:
        identifierType === "mobile" ? "+91 " + user.mobile : user.email,
      destination: "attacker@example.com",
      email: "attacker@example.com",
    });
    assert.equal(deliveries.at(-1)[0], "email");
    assert.equal(deliveries.at(-1)[1], user.email);
    assert.match(pending.data.destination, /^l\*\*\*@example.com$/);
    assert.ok(!JSON.stringify(pending.data).includes(user.email));
    assert.match(pending.cookies.join(";"), /HttpOnly/);
    assert.match(pending.cookies.join(";"), /SameSite=Strict/);
    const stored = await PendingLogin.findOne({ user: user._id }).select(
      "+tokenHash +digest +accountProof",
    );
    assert.notEqual(
      stored.tokenHash,
      pending.jar.get("gharseva_pending_login"),
    );
    assert.notEqual(stored.digest, pending.data.demoCode);
    assert.ok(!stored.accountProof.includes(user.email));
    for (const path of ["/auth/me", "/bookings", "/admin/users"])
      assert.equal((await call(path, { jar: pending.jar })).status, 401);
    const signed = await verify(pending);
    assert.equal(signed.status, 200);
    assert.equal(signed.data.role, "provider");
    assert.equal(signed.data.profile.status, "PENDING");
    assert.equal(signed.data.passwordHash, undefined);
    assert.equal(signed.data.sessionVersion, undefined);
  }
});

test("wrong passwords and suspended users create no challenge or session on shared login", async () => {
  for (const role of ["customer", "provider", "admin"]) {
    const user = await account(role);
    const denied = await call("/auth/login", {
      body: {
        identifier: user.email,
        password: "Wrong123",
        portal: "admin",
        role: "admin",
      },
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.jar.has("gharseva_pending_login"), false);
    await User.updateOne({ _id: user._id }, { $set: { status: "SUSPENDED" } });
    const suspended = await call("/auth/login", {
      body: { identifier: user.email, password: oldPassword },
    });
    assert.equal(suspended.status, 403);
    assert.equal(suspended.jar.has("gharseva_session"), false);
    assert.equal(await PendingLogin.countDocuments({ user: user._id }), 0);
  }
  assert.equal(deliveries.length, 0);
});
test("forged portal/role values cannot grant permissions after shared login", async () => {
  for (const role of ["customer", "provider", "admin"]) {
    const user = await account(role),
      p = await begin(user, { portal: "owner", role: "admin" });
    assert.equal((await PendingLogin.findOne({ user: user._id })).portal, role);
    const signed = await verify(p, { portal: "admin", role: "admin" });
    assert.equal(signed.data.role, role);
    assert.equal(
      (await call("/admin/users", { jar: signed.jar })).status,
      role === "admin" ? 200 : 403,
    );
  }
});

test("codes expire, are single use and only one concurrent verification can issue a session", async () => {
  const expired = await begin(await account());
  await PendingLogin.updateMany(
    { user: expired.user._id },
    { $set: { codeExpiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await verify(expired)).status, 400);
  const pending = await begin(await account());
  const original = new Map(pending.jar);
  const results = await Promise.all([
    verify(pending),
    verify(pending),
    verify(pending),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.jar.has("gharseva_session")).length, 1);
  assert.equal((await verify(pending, {}, original)).status, 401);
});

test("five failures exhaust a challenge; resend keeps failures and invalidates the old code", async () => {
  const pending = await begin(await account());
  const badCode = pending.data.demoCode === "111111" ? "222222" : "111111";
  assert.equal((await verify(pending, { code: badCode })).status, 400);
  assert.equal(
    (
      await call("/auth/login/resend", {
        jar: pending.jar,
        body: { portal: pending.portal },
      })
    ).status,
    429,
  );
  await allowResend(pending);
  const oldCode = pending.data.demoCode;
  const resent = await call("/auth/login/resend", {
    jar: pending.jar,
    body: { portal: pending.portal },
  });
  assert.equal(resent.status, 200);
  const stored = await PendingLogin.findOne({ user: pending.user._id });
  assert.equal(stored.attempts, 1);
  assert.equal(
    stored.expiresAt.toISOString(),
    pending.data.passwordProofExpiresAt,
  );
  // Resends never reuse an earlier numeric code in this password-proof window.
  const { codeDigest } = await import("../src/identity-services.js");
  const privateRecord = await PendingLogin.findById(stored._id).select(
    "+digest",
  );
  assert.notEqual(privateRecord.digest, codeDigest(stored._id + ":0", oldCode));
  assert.notEqual(oldCode, resent.data.demoCode);
  assert.equal((await verify(pending)).status, 400);
  const current = { ...pending, data: resent.data };
  while ((await PendingLogin.findById(stored._id)).attempts < 5)
    assert.equal(
      (
        await verify(current, {
          code: current.data.demoCode === "333333" ? "444444" : "333333",
        })
      ).status,
      400,
    );
  assert.equal((await verify(current)).status, 401);
  await allowResend(pending);
  assert.equal(
    (
      await call("/auth/login/resend", {
        jar: pending.jar,
        body: { portal: pending.portal },
      })
    ).status,
    401,
  );
});

test("resends cannot extend the password proof or exceed five account deliveries", async () => {
  const pending = await begin(await account());
  for (let i = 0; i < 4; i++) {
    await allowResend(pending);
    const r = await call("/auth/login/resend", {
      jar: pending.jar,
      body: { portal: pending.portal },
    });
    assert.equal(r.status, 200);
    assert.equal(
      r.data.passwordProofExpiresAt,
      pending.data.passwordProofExpiresAt,
    );
  }
  await allowResend(pending);
  assert.equal(
    (
      await call("/auth/login/resend", {
        jar: pending.jar,
        body: { portal: pending.portal },
      })
    ).status,
    429,
  );
  await PendingLogin.updateMany(
    { user: pending.user._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await verify(pending)).status, 401);
  assert.equal(
    (
      await call("/auth/login/resend", {
        jar: pending.jar,
        body: { portal: pending.portal },
      })
    ).status,
    401,
  );
});

test("pending passwords are invalidated by password, email, mobile, version, role or suspension changes", async () => {
  for (const update of [
    { passwordHash: await bcrypt.hash("ChangedPassword123!", 4) },
    { email: "changed-pending@example.com" },
    { mobile: "9766609998" },
    { sessionVersion: 1 },
    { role: "admin" },
    { status: "SUSPENDED" },
  ]) {
    const pending = await begin(await account());
    await User.updateOne({ _id: pending.user._id }, { $set: update });
    const denied = await verify(pending);
    assert.equal(denied.status, 401);
    assert.equal(denied.jar.has("gharseva_session"), false);
  }
});

test("authenticated contact edits invalidate pending proof without revoking existing sessions", async () => {
  const user = await account();
  const signed = await fixtureLogin(url, {
    identifier: user.email,
    password: oldPassword,
  });
  await ContactThrottle.deleteMany({ _id: /^password-login:/ });
  const pending = await begin(user);
  const changed = await call("/auth/me", {
    method: "PATCH",
    jar: signed.jar,
    body: {
      name: user.name,
      email: "contact-edit@example.com",
      mobile: user.mobile,
      city: "Ahmedabad",
    },
  });
  assert.equal(changed.status, 200);
  const restored = await call("/auth/me", {
    method: "PATCH",
    jar: signed.jar,
    body: {
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      city: "Ahmedabad",
    },
  });
  assert.equal(restored.status, 200);
  assert.equal((await verify(pending)).status, 401);
  assert.equal((await call("/auth/me", { jar: signed.jar })).status, 200);
});

test("browser, account and portal substitutions cannot select a different identity; back cancels", async () => {
  const a = await begin(await account());
  const b = await begin(await account());
  assert.equal((await verify(a, {}, new Map())).status, 401);

  assert.equal((await verify(a, {}, b.jar)).status, 400);
  const signed = await verify(a, {
    portal: "admin",
    role: "admin",
    userId: String(b.user._id),
    challengeId: String(b.user._id),
    email: b.user.email,
  });
  assert.equal(signed.status, 200);
  assert.equal(signed.data._id, String(a.user._id));
  const cancelledCookies = new Map(b.jar);
  assert.equal(
    (await call("/auth/login/pending", { method: "DELETE", jar: b.jar }))
      .status,
    200,
  );
  assert.equal((await verify(b, {}, cancelledCookies)).status, 401);
});

test("legacy standalone login requests and previously issued code challenges cannot bypass the password", async () => {
  const user = await account();
  for (const channel of ["email", "mobile"])
    for (const portal of [undefined, "customer"]) {
      const denied = await call("/auth/code/request", {
        body: { purpose: "login", channel, contact: user[channel], portal },
      });
      assert.equal(denied.status, 400);
      assert.equal(denied.jar.has("gharseva_session"), false);
    }
  const { codeDigest } = await import("../src/identity-services.js");
  const legacy = new ContactChallenge({
    owner: user._id,
    channel: "email",
    contact: user.email,
    purpose: "login",
    portal: "customer",
    mode: "demo",
    sessionVersion: 0,
    expiresAt: new Date(Date.now() + 300000),
  });
  legacy.digest = codeDigest(legacy._id, "123456");
  await legacy.save();
  const denied = await call("/auth/code/check", {
    body: {
      challengeId: String(legacy._id),
      code: "123456",
      portal: "customer",
    },
  });
  assert.equal(denied.status, 400);
  assert.equal(denied.jar.has("gharseva_session"), false);
});

test("live delivery failures and missing SMTP never expose codes or issue a session", async () => {
  const original = Object.fromEntries(
    [
      "AUTH_DELIVERY_MODE",
      "GHARSEVA_DEMO",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMTP_FROM",
    ].map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, {
    AUTH_DELIVERY_MODE: "live",
    GHARSEVA_DEMO: "false",
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    SMTP_FROM: "test@example.test",
  });
  try {
    const user = await account();
    deliveryFails = true;
    const failed = await call("/auth/login", {
      body: {
        identifier: user.email,
        password: oldPassword,
        portal: "customer",
      },
    });
    assert.equal(failed.status, 503);
    assert.equal(failed.data.demoCode, undefined);
    assert.equal(failed.jar.has("gharseva_session"), false);
    assert.equal(failed.jar.has("gharseva_pending_login"), false);
    assert.equal(await PendingLogin.countDocuments({ user: user._id }), 0);
    deliveryFails = false;
    const delivered = await begin(await account());
    assert.equal(delivered.data.demoCode, undefined);
    assert.equal(delivered.data.mode, "live");
    const code = deliveries.at(-1)[2]; // Captured test adapter, never an API response.
    assert.ok(!JSON.stringify(delivered.data).includes(code));
    await allowResend(delivered);
    deliveryFails = true;
    const resend = await call("/auth/login/resend", {
      jar: delivered.jar,
      body: { portal: delivered.portal },
    });
    assert.equal(resend.status, 503);
    assert.equal((await verify(delivered, { code })).status, 400);
    delete process.env.SMTP_HOST;
    const missing = await call("/auth/login", {
      body: {
        identifier: (await account()).email,
        password: oldPassword,
        portal: "customer",
      },
    });
    assert.equal(missing.status, 503);
    assert.equal(missing.data.demoCode, undefined);
  } finally {
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});

const external = (token, portal, extra = {}, jar = new Map()) =>
  call("/auth/external", {
    jar,
    body: { action: "login", idToken: token, portal, ...extra },
  });
test("linked Google and Apple identities sign in directly using mapping, with stored roles and approval", async () => {
  for (const provider of ["google.com", "apple.com"]) {
    const user = await account("provider");
    const token = "verified-" + provider;
    externalIdentities.set(token, {
      uid: token,
      provider,
      contact: "different-from-local@example.com",
      name: "External",
    });
    await ExternalIdentity.create({ uid: token, provider, user: user._id });
    const r = await external(token, "provider", {
      email: "attacker@example.com",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user._id, String(user._id));
    assert.equal(r.data.user.role, "provider");
    assert.equal(r.data.user.profile.status, "PENDING");
    assert.equal(r.jar.has("gharseva_session"), true);
    assert.equal(await PendingLogin.countDocuments({ user: user._id }), 0);
    assert.equal(
      (await external(token, "customer")).data.user.role,
      "provider",
    );
    assert.equal((await external(token, "admin")).data.user.role, "provider");
    await User.updateOne({ _id: user._id }, { $set: { status: "SUSPENDED" } });
    assert.equal((await external(token, "provider")).status, 403);
  }
});

test("unknown identities enter onboarding, never auto-merge by email, and linking needs completed local auth", async () => {
  const user = await account();
  externalIdentities.set("collision", {
    uid: "collision",
    provider: "google.com",
    contact: user.email,
  });
  const denied = await external("collision");
  assert.equal(denied.status, 409);
  assert.equal(denied.jar.has("gharseva_session"), false);
  assert.equal(await ExternalIdentity.countDocuments({ uid: "collision" }), 0);
  const pending = await begin(user);
  assert.equal(
    (
      await external(
        "collision",
        "customer",
        { action: "link", currentPassword: oldPassword },
        pending.jar,
      )
    ).status,
    401,
  );
  const signed = await verify(pending);
  assert.equal(
    (
      await external(
        "collision",
        "customer",
        { action: "link", currentPassword: "Wrong123" },
        signed.jar,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await external(
        "collision",
        "customer",
        { action: "link", currentPassword: oldPassword },
        signed.jar,
      )
    ).status,
    200,
  );
  assert.equal((await external("collision")).data.user._id, String(user._id));
  const other = await account();
  const otherSession = await fixtureLogin(url, {
    identifier: other.email,
    password: oldPassword,
  });
  assert.equal(
    (
      await external(
        "collision",
        "customer",
        { action: "link", currentPassword: oldPassword },
        otherSession.jar,
      )
    ).status,
    409,
  );
  externalIdentities.set("new-relay", {
    uid: "new-relay",
    provider: "apple.com",
    contact: "new@privaterelay.appleid.com",
    name: "",
  });
  const before = await User.countDocuments();
  const unknown = await external("new-relay", "provider");
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.onboarding, true);
  assert.equal(unknown.data.identity.contact, "new@privaterelay.appleid.com");
  assert.equal(unknown.jar.has("gharseva_session"), false);
  assert.equal(await User.countDocuments(), before);
  assert.equal(await ExternalIdentity.countDocuments({ uid: "new-relay" }), 0);
  assert.equal(
    (
      await external(
        "new-relay",
        "customer",
        { action: "link", currentPassword: oldPassword },
        signed.jar,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await external(
        "new-relay",
        "customer",
        {
          action: "link",
          currentPassword: oldPassword,
          appleRelayConsent: true,
        },
        signed.jar,
      )
    ).status,
    200,
  );
});

test("external token policy rejects invalid tokens, disabled providers, missing proof, old identity and admin mapping", async () => {
  const claims = {
    uid: "valid",
    email: "verified@example.com",
    email_verified: true,
    auth_time: Date.now() / 1000,
    firebase: { sign_in_provider: "google.com" },
  };
  assert.equal(
    externalIdentityFromClaims(claims, { google: true }).uid,
    "valid",
  );
  for (const [changed, options] of [
    [claims, { google: false }],
    [{ ...claims, email_verified: false }, { google: true }],
    [{ ...claims, auth_time: 0 }, { google: true }],
    [{ ...claims, auth_time: undefined }, { google: true }],
    [
      { ...claims, firebase: { sign_in_provider: "password" } },
      { google: true },
    ],
  ])
    assert.throws(() => externalIdentityFromClaims(changed, options));
  assert.equal((await external("forged-token")).status, 503);
  const admin = await account("admin");
  externalIdentities.set("admin-token", {
    uid: "admin-token",
    provider: "google.com",
    contact: admin.email,
  });
  await ExternalIdentity.create({
    uid: "admin-token",
    provider: "google.com",
    user: admin._id,
  });
  const denied = await external("admin-token");
  assert.equal(denied.status, 403);
  assert.equal(denied.jar.has("gharseva_session"), false);
  assert.equal(
    (await external("admin-token", "customer", { portal: undefined })).status,
    403,
  );
});

test("revocable sessions survive a second tab but exact logout preserves only the independent device", async () => {
  const user = await account(),
    first = await signIn({
      body: { identifier: user.email, password: oldPassword },
    }),
    second = await signIn({
      body: { identifier: user.email, password: oldPassword },
    });
  const saved = new Map(first.jar);
  assert.equal((await call("/auth/me", { jar: first.jar })).status, 200);
  assert.equal(
    (await call("/auth/me", { jar: new Map(first.jar) })).status,
    200,
  );
  assert.equal(
    (await call("/auth/logout", { method: "POST", body: {}, jar: first.jar }))
      .status,
    200,
  );
  assert.equal((await call("/auth/me", { jar: saved })).status, 401);
  assert.equal((await call("/auth/me", { jar: second.jar })).status, 200);
  assert.equal(
    await AuthSession.countDocuments({
      user: user._id,
      revokedAt: { $ne: null },
    }),
    1,
  );
});

test("stored admin idle expiry and recent-proof requirements apply to actual HTTP endpoints", async () => {
  const user = await account("admin"),
    signed = await signIn({
      body: { identifier: user.email, password: oldPassword },
    });
  await AuthSession.updateMany(
    { user: user._id },
    { $set: { reauthenticatedAt: new Date(Date.now() - 6 * 60000) } },
  );
  assert.equal(
    (
      await call("/admin/settings", {
        method: "PATCH",
        jar: signed.jar,
        body: { bookingEnabled: true, reauthenticated: true },
      })
    ).status,
    403,
  );
  const proof = await call("/auth/reauth", {
    body: { password: oldPassword },
    jar: signed.jar,
  });
  assert.equal(proof.status, 202);
  assert.equal(
    (
      await call("/auth/reauth/verify", {
        body: { code: proof.data.demoCode },
        jar: proof.jar,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/admin/settings", {
        method: "PATCH",
        jar: signed.jar,
        body: { bookingEnabled: true },
      })
    ).status,
    200,
  );
  await AuthSession.updateMany(
    { user: user._id },
    { $set: { idleExpiresAt: new Date(Date.now() - 1) } },
  );
  assert.equal(
    (await call("/auth/session/activity", { body: {}, jar: signed.jar }))
      .status,
    401,
  );
  assert.equal(
    (
      await call("/auth/reauth", {
        body: { password: oldPassword },
        jar: signed.jar,
      })
    ).status,
    401,
  );
});

test("raw HTTP mutations require the current session context while anonymous and wrong-role admin requests fail", async () => {
  const user = await account(),
    signed = await signIn({
      body: { identifier: user.email, password: oldPassword },
    }),
    Cookie = [...signed.jar].map(([k, v]) => k + "=" + v).join(";");
  const missing = await fetch(url + "/auth/change-password", {
    method: "POST",
    headers: { "X-GharSeva": "1", "Content-Type": "application/json", Cookie },
    body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
  });
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, "SESSION_CONTEXT_CHANGED");
  assert.equal((await fetch(url + "/admin/overview")).status, 401);
  assert.equal(
    (await call("/admin/overview", { jar: signed.jar })).status,
    403,
  );
  const me = await fetch(url + "/auth/me", { headers: { Cookie } });
  assert.match(me.headers.get("Cache-Control"), /no-store/);
  assert.ok(me.headers.get("X-GharSeva-Context"));
});
