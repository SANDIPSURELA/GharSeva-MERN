import { sessionFetch } from "./session-fixture.js";
import { fixtureCookie } from "./session-fixture.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import {
  User,
  Category,
  Settings,
  File,
  ProviderApplication,
  AccountInvitation,
  ContactChallenge,
  ContactThrottle,
  RegistrationSession,
} from "../src/models.js";
let db, server, url, admin, customer, provider;
const target = "invited@example.com";
const cookie = (u) => fixtureCookie(u);
async function call(
  path,
  { as, body, method = body ? "POST" : "GET", registration } = {},
) {
  const r = await sessionFetch(url + path, {
    method,
    headers: {
      "X-GharSeva": "1",
      ...(as
        ? { Cookie: await cookie(as) }
        : registration
          ? { Cookie: registration }
          : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function invite(extra = {}) {
  return call("/admin/invitations", {
    as: admin,
    body: {
      role: "customer",
      city: "Ahmedabad",
      channel: "email",
      contact: target,
      name: "Invited Customer",
      city: "Ahmedabad",
      ...extra,
    },
  });
}
async function proof(contact = target, channel = "email") {
  const sent = await call("/auth/code/request", {
    body: { purpose: "register", channel, contact },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const checked = await call("/auth/code/check", {
    body: { challengeId: sent.data.challengeId, code: sent.data.demoCode },
  });
  assert.equal(checked.status, 200, JSON.stringify(checked.data));
  return checked.cookie;
}
async function accept(token, registration, extra = {}) {
  return call("/auth/register", {
    registration,
    body: {
      role: "customer",
      city: "Ahmedabad",
      name: "Invited Customer",
      email: target,
      mobile: "9876500901",
      password: "Classroom123!",
      terms: true,
      invitationToken: token,
      ...extra,
    },
  });
}
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.GHARSEVA_DEMO = "true";
  process.env.AUTH_DELIVERY_MODE = "test";
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: {
      args: [
        "--nounixsocket",
        "--setParameter",
        "diagnosticDataCollectionEnabled=false",
      ],
    },
  });
  await mongoose.connect(db.getUri());
  await Promise.all([
    User.init(),
    AccountInvitation.init(),
    RegistrationSession.init(),
  ]);
  await Category.create({ slug: "plumbing", name: "Plumbing", enabled: true });
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await db.stop();
});
beforeEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  await Promise.all([
    User.deleteMany({}),
    AccountInvitation.deleteMany({}),
    RegistrationSession.deleteMany({}),
    ContactChallenge.deleteMany({}),
    ContactThrottle.deleteMany({}),
    File.deleteMany({}),
    ProviderApplication.deleteMany({}),
  ]);
  await Settings.updateOne(
    { key: "main" },
    { $set: { providerRegistration: true, bookingEnabled: true } },
    { upsert: true },
  );
  [admin, customer, provider] = await User.create([
    {
      name: "Demo Admin",
      email: "admin@example.com",
      mobile: "9876500001",
      passwordHash: "fixture",
      role: "admin",
    },
    {
      name: "Demo Customer",
      email: "customer@example.com",
      mobile: "9876500002",
      passwordHash: "fixture",
      role: "customer",
      city: "Ahmedabad",
    },
    {
      name: "Demo Provider",
      email: "provider@example.com",
      mobile: "9876500003",
      passwordHash: "fixture",
      role: "provider",
      profile: { category: "plumbing", status: "PENDING" },
    },
  ]);
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}/api`;
});
test("only administrators can create or manage invitations", async () => {
  for (const as of [undefined, customer, provider]) {
    const r = await call("/admin/invitations", {
      as,
      body: {
        role: "customer",
        city: "Ahmedabad",
        channel: "email",
        contact: target,
      },
    });
    assert.equal(r.status, as ? 403 : 401);
  }
  assert.equal(
    (await call("/admin/invitations", { as: customer })).status,
    403,
  );
});
test("creation fixes an allowed role, stores only a token hash and sends no message or account password", async () => {
  assert.equal((await invite({ role: "admin" })).status, 400);
  assert.equal((await invite({ password: "Classroom123!" })).status, 400);
  assert.equal((await invite({ approval: "APPROVED" })).status, 400);
  const r = await invite();
  assert.equal(r.status, 201);
  assert.equal(r.data.delivery, "MANUAL_LINK");
  assert.match(r.data.token, /^[a-f0-9]{64}$/);
  const stored = await AccountInvitation.findById(r.data.invitation._id).select(
    "+tokenHash",
  );
  assert.notEqual(stored.tokenHash, r.data.token);
  assert.ok(stored.expiresAt > Date.now() + 47 * 3600000);
  assert.equal(await User.countDocuments(), 3);
  assert.equal(JSON.stringify(r.data.invitation).includes(r.data.token), false);
});
test("existing contacts and duplicate pending invitations cannot overwrite accounts or switch roles", async () => {
  assert.equal((await invite({ contact: admin.email })).status, 409);
  assert.equal((await invite()).status, 201);
  assert.equal((await invite({ role: "provider" })).status, 409);
  assert.equal((await User.findById(admin._id)).role, "admin");
});
test("public preview masks the recipient and omits tokens, actor IDs and private history", async () => {
  const r = await invite();
  const p = await call("/invitations/preview", {
    body: { token: r.data.token },
  });
  assert.equal(p.status, 200);
  assert.equal(p.data.maskedContact, "i…@example.com");
  assert.equal(p.data.role, "customer");
  assert.equal(p.data.verificationReady, true);
  assert.equal(JSON.stringify(p.data).includes(target), false);
  assert.equal(p.data.token, undefined);
  assert.equal(p.data.history, undefined);
  assert.equal(
    (await call("/invitations/preview", { body: { token: "bad" } })).status,
    404,
  );
});
test("invitation links require matching verified registration contact even when ordinary legacy registration permits no proof", async () => {
  const r = await invite();
  assert.equal((await accept(r.data.token)).status, 401);
  const wrong = await proof("wrong@example.com");
  assert.equal(
    (await accept(r.data.token, wrong, { email: "wrong@example.com" })).status,
    403,
  );
  assert.equal(
    (
      await call("/invitations/proof", {
        registration: wrong,
        body: { token: r.data.token },
      })
    ).status,
    403,
  );
  assert.equal(
    (await AccountInvitation.findById(r.data.invitation._id)).state,
    "PENDING",
  );
});
test("verified recipient completes a customer account once and receives the normal session", async () => {
  const r = await invite(),
    registration = await proof();
  const p = await call("/invitations/proof", {
    registration,
    body: { token: r.data.token },
  });
  assert.equal(p.status, 200);
  assert.equal(p.data.contact, target);
  const a = await accept(r.data.token, registration);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.role, "customer");
  assert.ok(a.cookie);
  assert.equal(a.data.passwordHash, undefined);
  const stored = await AccountInvitation.findById(r.data.invitation._id);
  assert.equal(stored.state, "ACCEPTED");
  assert.equal(String(stored.user), a.data._id);
  assert.ok(stored.history.some((h) => h.action === "ACCEPTED"));
  assert.equal(
    (await call("/invitations/preview", { body: { token: r.data.token } }))
      .status,
    404,
  );
  assert.equal((await accept(r.data.token, registration)).status, 401);
});
test("an invitation cannot grant a different role or manufacture contact proof", async () => {
  const r = await invite({ role: "provider" }),
    registration = await proof();
  assert.equal((await accept(r.data.token, registration)).status, 403);
  assert.equal(
    (await accept(r.data.token, registration, { role: "provider" })).status,
    400,
  );
  assert.equal(
    (await accept(r.data.token, registration, { role: "admin" })).status,
    400,
  );
  assert.equal(
    (
      await accept(r.data.token, undefined, {
        verifiedRegistration: false,
        verification: { email: { at: new Date() } },
      })
    ).status,
    401,
  );
  assert.equal(
    (await AccountInvitation.findById(r.data.invitation._id)).state,
    "PENDING",
  );
});
test("replacing a link invalidates the old token and stale administrator changes", async () => {
  const r = await invite();
  const changed = await call(`/admin/invitations/${r.data.invitation._id}`, {
    as: admin,
    method: "PATCH",
    body: { revision: r.data.invitation.revision, action: "REPLACE_LINK" },
  });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.data.token, r.data.token);
  assert.equal(
    (await call("/invitations/preview", { body: { token: r.data.token } }))
      .status,
    404,
  );
  assert.equal(
    (
      await call("/invitations/preview", {
        body: { token: changed.data.token },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/admin/invitations/${r.data.invitation._id}`, {
        as: admin,
        method: "PATCH",
        body: { revision: r.data.invitation.revision, action: "REVOKE" },
      })
    ).status,
    409,
  );
});
test("revocation stops acceptance but permits a fresh separately audited invitation", async () => {
  const r = await invite();
  const revoked = await call(`/admin/invitations/${r.data.invitation._id}`, {
    as: admin,
    method: "PATCH",
    body: { revision: r.data.invitation.revision, action: "REVOKE" },
  });
  assert.equal(revoked.status, 200);
  const registration = await proof();
  assert.equal((await accept(r.data.token, registration)).status, 409);
  const next = await invite();
  assert.equal(next.status, 201);
  assert.notEqual(next.data.token, r.data.token);
  assert.ok(next.data.invitation.history.some((h) => h.action === "REVOKE"));
});
test("expired invitations fail preview and registration and can be replaced", async () => {
  const r = await invite();
  await AccountInvitation.updateOne(
    { _id: r.data.invitation._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (await call("/invitations/preview", { body: { token: r.data.token } }))
      .status,
    404,
  );
  assert.equal((await accept(r.data.token, await proof())).status, 409);
  const list = await call("/admin/invitations?state=EXPIRED", { as: admin });
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].status, "EXPIRED");
});
test("failed account creation releases the claim and leaves no orphan qualification file", async () => {
  const r = await invite({ role: "provider" }),
    registration = await proof();
  const doc = await readFile(
    new URL("../../client/public/demo/identity-front.png", import.meta.url),
  );
  const body = new FormData();
  body.append(
    "document",
    new Blob([doc], { type: "image/png" }),
    "qualification.png",
  );
  body.append(
    "data",
    JSON.stringify({
      role: "provider",
      name: "Invited Professional",
      email: target,
      mobile: customer.mobile,
      password: "Classroom123!",
      terms: true,
      invitationToken: r.data.token,
      category: "plumbing",
      categories: ["plumbing"],
      city: "Ahmedabad",
      area: "Fictional classroom area",
      bio: "A fictional service profile used for software testing only.",
      experience: 3,
      price: 349,
      skills: ["General service"],
    }),
  );
  const a = await call("/auth/register", { registration, body });
  assert.equal(a.status, 409);
  assert.equal(
    (await AccountInvitation.findById(r.data.invitation._id)).state,
    "PENDING",
  );
  assert.equal(await File.countDocuments(), 0);
  assert.equal(await User.countDocuments(), 3);
});
test("simultaneous acceptance cannot create two accounts", async () => {
  const r = await invite(),
    registration = await proof();
  const results = await Promise.all([
    accept(r.data.token, registration),
    accept(r.data.token, registration),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await User.countDocuments({ email: target }), 1);
  assert.equal(
    (await AccountInvitation.findById(r.data.invitation._id)).state,
    "ACCEPTED",
  );
});
test("phone invitations use canonical Indian mobile proof and preserve the fixed role", async () => {
  const r = await invite({ channel: "mobile", contact: "+91 98765 00901" });
  assert.equal(r.status, 201);
  assert.equal(r.data.invitation.contact, "9876500901");
  const registration = await proof("+91 98765 00901", "mobile");
  const a = await accept(r.data.token, registration);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.verification.mobile.mode, "demo");
  assert.equal(a.data.verification.email?.at, undefined);
});
test("invited providers remain pending and still require qualification and identity review", async () => {
  const r = await invite({ role: "provider" }),
    registration = await proof();
  const data = {
    role: "provider",
    name: "Invited Professional",
    email: target,
    mobile: "9876500901",
    password: "Classroom123!",
    terms: true,
    invitationToken: r.data.token,
    category: "plumbing",
    categories: ["plumbing"],
    city: "Ahmedabad",
    area: "Fictional classroom area",
    bio: "A fictional service profile used for software testing only.",
    experience: 3,
    price: 349,
    skills: ["General service"],
  };
  assert.equal(
    (await call("/auth/register", { registration, body: data })).status,
    400,
  );
  const body = new FormData();
  body.append("data", JSON.stringify(data));
  body.append(
    "document",
    new Blob(
      [
        await readFile(
          new URL(
            "../../client/public/demo/identity-front.png",
            import.meta.url,
          ),
        ),
      ],
      { type: "image/png" },
    ),
    "qualification.png",
  );
  const a = await call("/auth/register", { registration, body });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.profile.status, "PENDING");
  assert.equal(a.data.profile.identityRequired, true);
  assert.equal(
    await ProviderApplication.countDocuments({
      user: a.data._id,
      state: "SUBMITTED",
    }),
    1,
  );
  assert.equal(
    (
      await call(`/admin/users/${a.data._id}`, {
        as: admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    409,
  );
});
test("provider-registration pause is enforced on creation and acceptance", async () => {
  const r = await invite({ role: "provider" });
  await Settings.updateOne(
    { key: "main" },
    { $set: { providerRegistration: false } },
  );
  assert.equal(
    (await invite({ role: "provider", contact: "another@example.com" })).status,
    409,
  );
  const p = await call("/invitations/preview", {
    body: { token: r.data.token },
  });
  assert.equal(p.data.providerRegistration, false);
});
test("admin lists expose progress but cannot recover invitation tokens or mutate accepted accounts through an invitation", async () => {
  const r = await invite();
  await accept(r.data.token, await proof());
  const list = await call("/admin/invitations?state=ACCEPTED&q=Invited", {
    as: admin,
  });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].tokenHash, undefined);
  assert.equal(list.data.items[0].contactKey, undefined);
  assert.equal(list.data.items[0].reservedUser, undefined);
  assert.equal(JSON.stringify(list.data).includes(r.data.token), false);
  assert.equal(
    (
      await call(`/admin/invitations/${r.data.invitation._id}`, {
        as: admin,
        method: "PATCH",
        body: { revision: list.data.items[0].revision, action: "REVOKE" },
      })
    ).status,
    409,
  );
});
