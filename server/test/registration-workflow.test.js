import { sessionFetch } from "./session-fixture.js";
import { fixtureLogin } from "./login-fixture.js";
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import {
  User,
  Category,
  Booking,
  ContactChallenge,
  ContactThrottle,
  ProviderApplication,
  RegistrationSession,
} from "../src/models.js";
import { contactKey, identityOptions } from "../src/identity-services.js";
import { indiaDate } from "../src/domain.js";
let db,
  server,
  base,
  adminCookie,
  customerCookie,
  serial = 0;
const secret = "Example123!";
async function call(
  path,
  { body, method = body ? "POST" : "GET", jar = new Map() } = {},
) {
  const response = await sessionFetch(base + path, {
    method,
    headers: {
      "X-GharSeva": "1",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join(";"),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const cookies = response.headers.getSetCookie();
  for (const c of cookies) {
    const first = c.split(";")[0],
      i = first.indexOf("=");
    if (first.slice(i + 1)) jar.set(first.slice(0, i), first.slice(i + 1));
    else jar.delete(first.slice(0, i));
  }
  return { status: response.status, data: await response.json(), cookies, jar };
}
async function identity(channel = "email") {
  serial++;
  const contact =
    channel === "email"
      ? `applicant${serial}@example.com`
      : `98765${String(serial).padStart(5, "0")}`;
  const jar = new Map();
  const sent = await call("/auth/code/request", {
    body: { channel, contact, purpose: "register" },
    jar,
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.mode, "demo");
  const checked = await call("/auth/code/check", {
    body: { challengeId: sent.data.challengeId, code: sent.data.demoCode },
    jar,
  });
  assert.equal(checked.status, 200);
  return { jar, contact, channel, sent, checked };
}
const draftBody = (identity, overrides = {}) => ({
  saveConsent: true,
  followUpConsent: false,
  step: 2,
  revision: 0,
  data: {
    name: "Individual Professional",
    email:
      identity.channel === "email"
        ? identity.contact
        : `phone-${serial}@example.com`,
    mobile:
      identity.channel === "mobile"
        ? identity.contact
        : `97654${String(serial).padStart(5, "0")}`,
    city: "Ahmedabad",
    categories: ["plumbing", "electrical"],
    area: "Satellite",
    bio: "Experienced household repairs and maintenance for local homes.",
    experience: 3,
    price: 349,
    password: "MustNeverBeSaved123",
  },
  ...overrides,
});
async function submitProvider(i, body = draftBody(i)) {
  const form = new FormData();
  form.append(
    "data",
    JSON.stringify({
      ...body.data,
      password: secret,
      role: "provider",
      terms: true,
      verifiedRegistration: true,
      followUpConsent: body.followUpConsent,
    }),
  );
  form.append(
    "document",
    new Blob(["%PDF-1.4\nFictional classroom document"], {
      type: "application/pdf",
    }),
    "sample.pdf",
  );
  return call("/auth/register", { body: form, jar: i.jar });
}
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_GOOGLE_ENABLED = "false";
  process.env.AUTH_APPLE_ENABLED = "false";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.GHARSEVA_DEMO = "true";
  process.env.AUTH_DELIVERY_MODE = "test";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
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
    ProviderApplication.init(),
    RegistrationSession.init(),
  ]);
  await Category.create([
    {
      slug: "plumbing",
      name: "Plumbing",
      description: "Household plumbing",
      price: 299,
    },
    {
      slug: "electrical",
      name: "Electrical",
      description: "Electrical jobs",
      price: 299,
    },
    {
      slug: "cleaning",
      name: "Cleaning",
      description: "Household cleaning",
      price: 299,
    },
  ]);
  await User.create([
    {
      name: "Administrator",
      email: "workflow-admin@example.com",
      mobile: "9999988881",
      passwordHash: await bcrypt.hash(secret, 4),
      role: "admin",
    },
    {
      name: "Existing Customer",
      email: "workflow-customer@example.com",
      mobile: "9999988882",
      passwordHash: await bcrypt.hash(secret, 4),
      role: "customer",
      city: "Ahmedabad",
    },
  ]);
});
beforeEach(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  adminCookie = (
    await fixtureLogin(base, {
      identifier: "workflow-admin@example.com",
      password: secret,
      portal: "admin",
    })
  ).jar;
  customerCookie = (
    await fixtureLogin(base, {
      identifier: "workflow-customer@example.com",
      password: secret,
      portal: "customer",
    })
  ).jar;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
});
after(async () => {
  await mongoose.disconnect();
  await db.stop();
});

test("OTP registration is single-use, HttpOnly, contact-bound and honestly labelled demo", async () => {
  const i = await identity();
  assert.match(i.checked.cookies.join(";"), /HttpOnly/);
  const row = await ContactChallenge.findById(i.sent.data.challengeId).select(
    "+digest",
  );
  assert.notEqual(row.digest, i.sent.data.demoCode);
  assert.equal(row.used, true);
  assert.equal(
    (
      await call("/auth/code/check", {
        body: {
          challengeId: i.sent.data.challengeId,
          code: i.sent.data.demoCode,
        },
      })
    ).status,
    400,
  );
  const body = {
    name: "New Verified Customer",
    email: i.contact,
    mobile: "9888877771",
    password: secret,
    role: "customer",
    city: "Ahmedabad",
    terms: true,
    verifiedRegistration: true,
  };
  assert.equal(
    (
      await call("/auth/register", {
        body: { ...body, email: "forged@example.com" },
        jar: i.jar,
      })
    ).status,
    400,
  );
  const result = await call("/auth/register", { body, jar: i.jar });
  assert.equal(result.status, 201);
  assert.equal(result.data.verification.email.mode, "demo");
  assert.equal(result.data.verification.mobile?.at, undefined);
  assert.equal(
    (await call("/auth/registration-session", { jar: i.jar })).data,
    null,
  );
});
test("new signup cannot bypass contact verification or manufacture proof", async () => {
  const r = await call("/auth/register", {
    body: {
      name: "No Proof Customer",
      email: "no-proof@example.com",
      mobile: "9888877772",
      password: secret,
      role: "customer",
      city: "Ahmedabad",
      terms: true,
      verifiedRegistration: true,
      verification: { email: { mode: "live", at: new Date() } },
    },
  });
  assert.equal(r.status, 401);
  assert.equal(await User.exists({ email: "no-proof@example.com" }), null);
});
test("wrong codes lock after five tries, expired codes fail and resend is throttled", async () => {
  const sent = await call("/auth/code/request", {
    body: {
      channel: "email",
      contact: "lock@example.com",
      purpose: "register",
    },
  });
  assert.equal(sent.status, 201);
  assert.equal(
    (
      await call("/auth/code/request", {
        body: {
          channel: "email",
          contact: "lock@example.com",
          purpose: "register",
        },
      })
    ).status,
    429,
  );
  for (let n = 0; n < 5; n++)
    assert.equal(
      (
        await call("/auth/code/check", {
          body: { challengeId: sent.data.challengeId, code: "000000" },
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call("/auth/code/check", {
        body: { challengeId: sent.data.challengeId, code: sent.data.demoCode },
      })
    ).status,
    400,
  );
  const expired = await call("/auth/code/request", {
    body: { channel: "mobile", contact: "9888877773", purpose: "register" },
  });
  await ContactChallenge.updateOne(
    { _id: expired.data.challengeId },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (
      await call("/auth/code/check", {
        body: {
          challengeId: expired.data.challengeId,
          code: expired.data.demoCode,
        },
      })
    ).status,
    400,
  );
});
test("concurrent code requests cannot bypass the per-contact cooldown", async () => {
  const results = await Promise.all(
    [1, 2].map(() =>
      call("/auth/code/request", {
        body: {
          channel: "email",
          contact: "concurrent-code@example.com",
          purpose: "register",
        },
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 429]);
});
test("saving partial forms requires consent and stores neither passwords nor uploaded documents", async () => {
  const i = await identity();
  const body = draftBody(i);
  assert.equal(
    (
      await call("/registration/application", {
        method: "PUT",
        body: { ...body, saveConsent: false },
        jar: i.jar,
      })
    ).status,
    400,
  );
  const result = await call("/registration/application", {
    method: "PUT",
    body,
    jar: i.jar,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.data.password, undefined);
  assert.equal(result.data.revision, 1);
  assert.equal(await User.exists({ email: i.contact }), null);
  const saved = await ProviderApplication.findById(result.data._id).lean();
  assert.equal(saved.data.password, undefined);
  assert.ok(saved.expiresAt);
  assert.equal(saved.saveConsent, true);
  const anonymous = await call("/registration/application");
  assert.equal(anonymous.status, 401);
  const other = await identity();
  assert.equal(
    (await call("/registration/application", { jar: other.jar })).data,
    null,
  );
});
test("admin queue includes incomplete forms but masks contact without follow-up permission", async () => {
  const i = await identity();
  const result = await call("/registration/application", {
    method: "PUT",
    body: draftBody(i),
    jar: i.jar,
  });
  const denied = await call("/admin/applications", { jar: customerCookie });
  assert.equal(denied.status, 403);
  const queue = await call("/admin/applications?state=DRAFT", {
    jar: adminCookie,
  });
  const row = queue.data.items.find((a) => a._id === result.data._id);
  assert.ok(row);
  assert.notEqual(row.contact, i.contact);
  assert.equal(row.data.email, undefined);
  assert.equal(row.data.mobile, undefined);
  assert.equal(
    (
      await call(`/admin/applications/${row._id}`, {
        method: "PATCH",
        body: {
          revision: row.revision,
          action: "FOLLOW_UP",
          note: "Called about the missing document",
        },
        jar: adminCookie,
      })
    ).status,
    403,
  );
  const updated = await call("/registration/application", {
    method: "PUT",
    body: draftBody(i, {
      revision: result.data.revision,
      followUpConsent: true,
    }),
    jar: i.jar,
  });
  assert.equal(updated.status, 200);
  const consented = (
    await call("/admin/applications?state=DRAFT", { jar: adminCookie })
  ).data.items.find((a) => a._id === row._id);
  assert.equal(consented.contact, i.contact);
  assert.equal(consented.followUpConsent, true);
  assert.equal(
    (
      await call(`/admin/applications/${row._id}`, {
        method: "PATCH",
        body: {
          revision: consented.revision,
          action: "FOLLOW_UP",
          note: "Applicant asked for help completing the form.",
        },
        jar: adminCookie,
      })
    ).status,
    200,
  );
});
test("draft revision conflicts preserve newer edits and verified primary contact is immutable", async () => {
  const i = await identity();
  const body = draftBody(i);
  const first = await call("/registration/application", {
    method: "PUT",
    body,
    jar: i.jar,
  });
  assert.equal(first.status, 200);
  assert.equal(
    (
      await call("/registration/application", {
        method: "PUT",
        body: { ...body, data: { ...body.data, name: "Stale overwrite" } },
        jar: i.jar,
      })
    ).status,
    409,
  );
  const changed = await call("/registration/application", {
    method: "PUT",
    body: {
      ...body,
      revision: first.data.revision,
      data: { ...body.data, email: "unverified@example.com" },
    },
    jar: i.jar,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.data.email, i.contact);
});
test("inactive drafts are flagged, expired drafts disappear and draft deletion creates no account", async () => {
  const i = await identity();
  const saved = await call("/registration/application", {
    method: "PUT",
    body: draftBody(i),
    jar: i.jar,
  });
  await ProviderApplication.updateOne(
    { _id: saved.data._id },
    { $set: { lastActivityAt: new Date(Date.now() - 2 * 86400000) } },
  );
  assert.ok(
    (
      await call("/admin/applications?state=INACTIVE", { jar: adminCookie })
    ).data.items.some((a) => a._id === saved.data._id),
  );
  await ProviderApplication.updateOne(
    { _id: saved.data._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (await call("/registration/application", { jar: i.jar })).data,
    null,
  );
  assert.ok(
    !(await call("/admin/applications", { jar: adminCookie })).data.items.some(
      (a) => a._id === saved.data._id,
    ),
  );
  assert.equal(
    (await call("/registration/application", { method: "DELETE", jar: i.jar }))
      .status,
    200,
  );
  assert.equal(await User.exists({ email: i.contact }), null);
});
test("provider submission converts the saved draft to one pending account with several services", async () => {
  const i = await identity();
  const body = draftBody(i, { followUpConsent: true });
  await call("/registration/application", { method: "PUT", body, jar: i.jar });
  const result = await submitProvider(i, body);
  assert.equal(result.status, 201);
  assert.equal(result.data.profile.status, "PENDING");
  assert.deepEqual(result.data.profile.categories, ["plumbing", "electrical"]);
  const a = await ProviderApplication.findOne({ user: result.data._id });
  assert.equal(a.state, "SUBMITTED");
  assert.equal(a.expiresAt, undefined);
  assert.equal(
    await ProviderApplication.countDocuments({
      contactKey: contactKey("email", i.contact),
    }),
    1,
  );
  assert.equal(
    (await call("/providers")).data.some((p) => p._id === result.data._id),
    false,
  );
  const reviewed = await call(`/admin/applications/${a._id}`, {
    method: "PATCH",
    body: {
      revision: a.revision,
      action: "APPROVED",
      note: "Reviewed the fictional supporting document and profile details.",
    },
    jar: adminCookie,
  });
  assert.equal(reviewed.status, 200);
  const publicRow = (await call("/providers")).data.find(
    (p) => p._id === result.data._id,
  );
  assert.deepEqual(publicRow.categories, ["plumbing", "electrical"]);
  assert.deepEqual(publicRow.categoryNames, ["Plumbing", "Electrical"]);
  const date = indiaDate(new Date(Date.now() + 2 * 86400000));
  await User.updateOne(
    { _id: result.data._id },
    { $set: { "profile.days": [0, 1, 2, 3, 4, 5, 6] } },
  );
  const bookingBody = {
    providerId: result.data._id,
    category: "electrical",
    date,
    time: "09:00",
    address: "123 Fictional Street, Ahmedabad",
  };
  const booked = await call("/bookings", {
    body: bookingBody,
    jar: customerCookie,
  });
  assert.equal(booked.status, 201);
  assert.equal(booked.data.category, "electrical");
  assert.equal(booked.data.service, "Electrical");
  assert.equal(booked.data.price, 349);
  assert.equal(
    (
      await call("/bookings", {
        body: { ...bookingBody, time: "11:00", category: "cleaning" },
        jar: customerCookie,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/bookings", {
        body: { ...bookingBody, category: "plumbing" },
        jar: customerCookie,
      })
    ).status,
    409,
  );
});
test("invalid review notes do not mutate approvals and stale reviews are rejected", async () => {
  const i = await identity();
  const created = await submitProvider(i);
  const a = await ProviderApplication.findOne({ user: created.data._id });
  assert.equal(
    (
      await call(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: { revision: a.revision, action: "APPROVED", note: "short" },
        jar: adminCookie,
      })
    ).status,
    400,
  );
  assert.equal(
    (await User.findById(created.data._id)).profile.status,
    "PENDING",
  );
  assert.equal(
    (
      await call(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: {
          revision: a.revision,
          action: "NEEDS_CORRECTION",
          note: "Please provide a more detailed description of your work.",
        },
        jar: adminCookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: {
          revision: a.revision,
          action: "APPROVED",
          note: "Stale approval attempt must not overwrite newer review.",
        },
        jar: adminCookie,
      })
    ).status,
    409,
  );
  const status = await call("/provider/application", { jar: i.jar });
  assert.equal(status.data.state, "NEEDS_CORRECTION");
  assert.match(status.data.history.at(-1).note, /detailed/);
});
test("existing accounts verify their own contact before OTP login and changing it clears proof", async () => {
  const sent = await call("/auth/code/request", {
    body: {
      channel: "email",
      contact: "workflow-customer@example.com",
      purpose: "verify",
    },
    jar: customerCookie,
  });
  assert.equal(sent.status, 201);
  const checked = await call("/auth/code/check", {
    body: { challengeId: sent.data.challengeId, code: sent.data.demoCode },
    jar: customerCookie,
  });
  assert.equal(checked.status, 200);
  assert.equal(checked.data.user.verification.email.mode, "demo");
  await ContactThrottle.deleteOne({
    _id: contactKey("email", "workflow-customer@example.com"),
  });
  const login = await call("/auth/code/request", {
    body: {
      channel: "email",
      contact: "workflow-customer@example.com",
      purpose: "login",
    },
  });
  assert.equal(login.status, 400);
  assert.equal(login.jar.has("gharseva_session"), false);
  const changed = await call("/auth/me", {
    method: "PATCH",
    body: {
      name: "Existing Customer",
      email: "changed-customer@example.com",
      mobile: "9999988882",
      city: "Ahmedabad",
    },
    jar: customerCookie,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.verification?.email?.at, undefined);
});
test("demo auth is refused in production and unavailable external identities cannot mint sessions", async () => {
  assert.equal(identityOptions().google, false);
  const bad = await call("/auth/external", {
    body: { idToken: "forged-token", action: "register", portal: "customer" },
  });
  assert.equal(bad.status, 503);
  assert.equal(bad.jar.has("gharseva_registration"), false);
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => createApp(), /forbidden in production/);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});

test("mobile registration proof stays separate from password login", async () => {
  const i = await identity("mobile");
  const registered = await call("/auth/register", {
    body: {
      name: "Mobile First Customer",
      email: `mobile-first-${serial}@example.com`,
      mobile: i.contact,
      password: secret,
      role: "customer",
      city: "Ahmedabad",
      terms: true,
      verifiedRegistration: true,
    },
    jar: i.jar,
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.verification.mobile.mode, "demo");
  const denied = await call("/auth/code/request", {
    body: {
      channel: "mobile",
      contact: i.contact,
      purpose: "login",
      portal: "customer",
    },
  });
  assert.equal(denied.status, 400);
  const signedIn = await fixtureLogin(base, {
    identifier: "+91" + i.contact,
    password: secret,
    portal: "customer",
  });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data._id, registered.data._id);
});

test("expired registration proof and strict legacy verification create no account", async () => {
  const i = await identity();
  await RegistrationSession.updateMany(
    { contact: i.contact },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  const body = {
    name: "Expired Proof Customer",
    email: i.contact,
    mobile: "9888877791",
    password: secret,
    role: "customer",
    city: "Ahmedabad",
    terms: true,
    verifiedRegistration: true,
  };
  assert.equal(
    (await call("/auth/register", { body, jar: i.jar })).status,
    401,
  );
  const previous = process.env.REQUIRE_VERIFIED_REGISTRATION;
  process.env.REQUIRE_VERIFIED_REGISTRATION = "true";
  try {
    assert.equal(
      (
        await call("/auth/register", {
          body: {
            ...body,
            email: "strict-legacy@example.com",
            verifiedRegistration: false,
          },
        })
      ).status,
      401,
    );
  } finally {
    if (previous === undefined)
      delete process.env.REQUIRE_VERIFIED_REGISTRATION;
    else process.env.REQUIRE_VERIFIED_REGISTRATION = previous;
  }
  assert.equal(await User.exists({ email: i.contact }), null);
});

test("new queue checks actual documents and serialises competing manual decisions", async () => {
  const i = await identity();
  const created = await submitProvider(i);
  let a = await ProviderApplication.findOne({ user: created.data._id });
  const user = await User.findById(created.data._id);
  const documents = [...user.profile.documents];
  await User.updateOne(
    { _id: user._id },
    { $set: { "profile.documents": [] } },
  );
  assert.equal(
    (
      await call(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: {
          revision: a.revision,
          action: "APPROVED",
          note: "A missing document must never permit this approval.",
        },
        jar: adminCookie,
      })
    ).status,
    400,
  );
  assert.equal((await User.findById(user._id)).profile.status, "PENDING");
  await User.updateOne(
    { _id: user._id },
    { $set: { "profile.documents": documents } },
  );
  const results = await Promise.all(
    ["APPROVED", "REJECTED"].map((action) =>
      call(`/admin/applications/${a._id}`, {
        method: "PATCH",
        body: {
          revision: a.revision,
          action,
          note: "Competing manual review with a sufficiently detailed note.",
        },
        jar: adminCookie,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  a = await ProviderApplication.findById(a._id);
  assert.equal((await User.findById(user._id)).profile.status, a.state);
});
