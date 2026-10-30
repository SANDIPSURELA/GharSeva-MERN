import { sessionFetch } from "./session-fixture.js";
import { fixtureLogin } from "./login-fixture.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createIsolatedMongo,
  connectIsolatedMongo,
} from "../../scripts/isolated-mongo.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import {
  User,
  Category,
  Booking,
  Review,
  Enquiry,
  File,
  Payment,
} from "../src/models.js";
import { indiaDate, validateSchedule } from "../src/domain.js";
let db,
  server,
  url,
  provider,
  customer,
  admin,
  other,
  cookies = {},
  registeredProvider,
  booking;
const futureDate = (days) => indiaDate(new Date(Date.now() + days * 86400000));
async function request(
  path,
  { method = "GET", body, as, header = true, origin } = {},
) {
  const headers = {
    ...(header ? { "X-GharSeva": "1" } : {}),
    ...(as ? { Cookie: cookies[as] } : {}),
    ...(body && !(body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(origin ? { Origin: origin } : {}),
  };
  const r = await sessionFetch(url + path, {
    method,
    headers,
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function signIn({ body, header = true, origin } = {}) {
  if (!header)
    return request("/auth/login", { method: "POST", body, header, origin });
  return fixtureLogin(url, body, origin ? { Origin: origin } : {});
}
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.PAYMENTS_MODE = "demo";
  process.env.AUTH_DELIVERY_MODE = "test";
  process.env.GHARSEVA_DEMO = "true";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  db = await createIsolatedMongo();
  await connectIsolatedMongo(db);
  await Promise.all([Booking.init(), Payment.init()]);
  await Category.create({
    slug: "plumbing",
    name: "Plumbing",
    description: "Tap and pipe repairs",
    price: 299,
    image: "/images/professional.jpg",
  });
  const hash = await bcrypt.hash("Example123", 4);
  [customer, other, admin, provider] = await User.create([
    {
      name: "Customer A",
      email: "a@example.com",
      mobile: "9999999991",
      role: "customer",
      city: "Ahmedabad",
      passwordHash: hash,
    },
    {
      name: "Customer B",
      email: "b@example.com",
      mobile: "9999999992",
      role: "customer",
      city: "Ahmedabad",
      passwordHash: hash,
    },
    {
      name: "Administrator",
      email: "admin@example.com",
      mobile: "9999999993",
      role: "admin",
      passwordHash: hash,
    },
    {
      name: "Provider",
      email: "p@example.com",
      mobile: "9999999994",
      role: "provider",
      passwordHash: hash,
      profile: {
        category: "plumbing",
        city: "Ahmedabad",
        area: "Satellite, Ahmedabad",
        bio: "A professional plumber for household water fittings and repairs.",
        price: 349,
        status: "APPROVED",
        days: [0, 1, 2, 3, 4, 5, 6],
        slots: ["09:00", "11:00", "14:00", "16:00"],
        skills: ["Tap repair"],
      },
    },
  ]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}/api`;
  for (const [key, user] of Object.entries({
    customer,
    other,
    admin,
    provider,
  })) {
    const r = await signIn({
      method: "POST",
      body: { identifier: user.email, password: "Example123" },
    });
    assert.equal(r.status, 200);
    cookies[key] = r.cookie;
  }
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
});
test("health checks a connected MongoDB", async () =>
  assert.equal((await request("/health")).data.database, "connected"));
test("admin sign-in validates the stored role before issuing a session", async () => {
  const wrongPortal = await signIn({
    method: "POST",
    body: {
      identifier: customer.email,
      password: "Example123",
      portal: "admin",
    },
  });
  assert.equal(wrongPortal.status, 200);
  assert.equal(wrongPortal.data.role, "customer");
  cookies.forgedAdmin = wrongPortal.cookie;
  assert.equal(
    (await request("/admin/users", { as: "forgedAdmin" })).status,
    403,
  );
  const accepted = await signIn({
    method: "POST",
    body: { identifier: admin.email, password: "Example123" },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.role, "admin");
  assert.ok(accepted.cookie);
});
test("unauthenticated users cannot create bookings", async () =>
  assert.equal(
    (await request("/bookings", { method: "POST", body: {} })).status,
    401,
  ));
test("unsafe requests require CSRF verification header", async () =>
  assert.equal(
    (
      await signIn({
        method: "POST",
        header: false,
        body: { identifier: "a@example.com", password: "Example123" },
      })
    ).status,
    403,
  ));
test("cross-origin writes are rejected", async () =>
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        as: "customer",
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  ));
test("customer cannot access admin data", async () =>
  assert.equal(
    (await request("/admin/overview", { as: "customer" })).status,
    403,
  ));
test("invalid provider does not fall back to another person", async () =>
  assert.equal((await request("/providers/invalid")).status, 404));
test("past dates and unknown slots are rejected", async () => {
  assert.throws(() =>
    validateSchedule("2020-01-01", "09:00", provider.profile),
  );
  assert.throws(() =>
    validateSchedule(futureDate(1), "10:01", provider.profile),
  );
});
test("provider cannot create customer bookings", async () =>
  assert.equal(
    (await request("/bookings", { method: "POST", as: "provider", body: {} }))
      .status,
    403,
  ));
test("server price and customer ownership override forged input", async () => {
  const r = await request("/bookings", {
    method: "POST",
    as: "customer",
    body: {
      providerId: provider._id,
      date: futureDate(1),
      time: "09:00",
      address: "10 Sample Street, Ahmedabad",
      price: 1,
      customer: other._id,
      status: "COMPLETED",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.price, 349);
  assert.equal(r.data.customer._id, String(customer._id));
  assert.equal(r.data.status, "PENDING");
  assert.match(r.data.visitCode, /^\d{6}$/);
  booking = r.data;
});
test("same active provider/date/time slot cannot be double booked", async () => {
  const r = await request("/bookings", {
    method: "POST",
    as: "other",
    body: {
      providerId: provider._id,
      date: futureDate(1),
      time: "09:00",
      address: "11 Other Street, Ahmedabad",
    },
  });
  assert.equal(r.status, 409);
});
test("customer B cannot see customer A bookings", async () =>
  assert.deepEqual((await request("/bookings", { as: "other" })).data, []));
test("provider receives the same booking but not its visit code", async () => {
  const r = await request("/bookings", { as: "provider" });
  assert.equal(r.data[0]._id, booking._id);
  assert.equal(r.data[0].visitCode, undefined);
});
test("admin cannot see customer visit codes", async () => {
  const r = await request("/admin/overview", { as: "admin" });
  assert.equal(r.data.bookings[0].visitCode, undefined);
});
test("unassigned customer cannot cancel another booking", async () =>
  assert.equal(
    (
      await request(`/bookings/${booking._id}/status`, {
        method: "PATCH",
        as: "other",
        body: { status: "CANCELLED" },
      })
    ).status,
    403,
  ));
test("only assigned provider can accept booking", async () => {
  const r = await request(`/bookings/${booking._id}/status`, {
    method: "PATCH",
    as: "provider",
    body: { status: "ACCEPTED" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "ACCEPTED");
});
test("invalid status jumps are rejected", async () =>
  assert.equal(
    (
      await request(`/bookings/${booking._id}/status`, {
        method: "PATCH",
        as: "provider",
        body: { status: "COMPLETED" },
      })
    ).status,
    409,
  ));
test("arrival transitions to on the way", async () =>
  assert.equal(
    (
      await request(`/bookings/${booking._id}/status`, {
        method: "PATCH",
        as: "provider",
        body: { status: "ON_THE_WAY" },
      })
    ).data.status,
    "ON_THE_WAY",
  ));
test("isolated booking requires its deposit before OTP and uses the explicit classroom payment fixture", async () => {
  const unpaid = await request("/bookings/" + booking._id + "/status", {
    method: "PATCH",
    as: "provider",
    body: { status: "IN_PROGRESS", code: booking.visitCode },
  });
  assert.equal(unpaid.status, 409);
  const created = await request("/payments/booking/" + booking._id + "/order", {
    method: "POST",
    as: "customer",
    body: { acceptDeposit: true },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.payment.mode, "demo");
  const captured = await request(
    "/payments/" + created.data.payment._id + "/demo",
    {
      method: "POST",
      as: "customer",
      body: { outcome: "CAPTURED" },
    },
  );
  assert.equal(captured.status, 200);
  assert.equal(captured.data.payment.status, "CAPTURED");
});

test("wrong OTP does not start work", async () =>
  assert.equal(
    (
      await request(`/bookings/${booking._id}/status`, {
        method: "PATCH",
        as: "provider",
        body: { status: "IN_PROGRESS", code: "wrong" },
      })
    ).status,
    400,
  ));
test("customer cannot cancel once provider is on the way", async () =>
  assert.equal(
    (
      await request(`/bookings/${booking._id}/status`, {
        method: "PATCH",
        as: "customer",
        body: { status: "CANCELLED" },
      })
    ).status,
    409,
  ));
test("correct OTP starts work and is removed from booking responses", async () => {
  const r = await request(`/bookings/${booking._id}/status`, {
    method: "PATCH",
    as: "provider",
    body: { status: "IN_PROGRESS", code: booking.visitCode },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "IN_PROGRESS");
  assert.equal(
    (await request("/bookings", { as: "customer" })).data[0].visitCode,
    "",
  );
});
test("completion frees the slot and records timeline", async () => {
  const r = await request(`/bookings/${booking._id}/status`, {
    method: "PATCH",
    as: "provider",
    body: { status: "COMPLETED" },
  });
  assert.equal(r.data.active, false);
  assert.equal(r.data.timeline.length, 5);
});
test("customer can review their own completed booking once", async () => {
  const body = {
    bookingId: booking._id,
    rating: 5,
    feedback: "The repair was done carefully and on time.",
  };
  assert.equal(
    (await request("/reviews", { method: "POST", as: "other", body })).status,
    400,
  );
  assert.equal(
    (await request("/reviews", { method: "POST", as: "customer", body }))
      .status,
    201,
  );
  assert.equal(
    (await request("/reviews", { method: "POST", as: "customer", body }))
      .status,
    409,
  );
});
test("public provider ratings are computed from saved reviews", async () => {
  const r = await request(`/providers/${provider._id}`);
  assert.equal(r.data.rating, 5);
  assert.equal(r.data.reviews, 1);
  assert.equal(r.data.completed, 1);
});
test("moderated reviews disappear from public ratings", async () => {
  const r = await Review.findOne();
  await request(`/admin/reviews/${r._id}`, {
    method: "PATCH",
    as: "admin",
    body: { hidden: true },
  });
  const p = await request(`/providers/${provider._id}`);
  assert.equal(p.data.reviews, 0);
  assert.equal(p.data.feedback.length, 0);
});
test("contact submissions are saved and visible to admin", async () => {
  const r = await request("/enquiries", {
    method: "POST",
    body: {
      name: "Sample Sender",
      email: "sender@example.com",
      mobile: "9999999998",
      subject: "Account question",
      message: "I would like help understanding the booking status.",
    },
  });
  assert.equal(r.status, 201);
  assert.equal(await Enquiry.countDocuments(), 1);
  assert.equal(
    (await request("/admin/overview", { as: "admin" })).data.enquiries.length,
    1,
  );
});
test("profile updates cannot escalate role and duplicate emails fail", async () => {
  const r = await request("/auth/me", {
    method: "PATCH",
    as: "customer",
    body: {
      name: customer.name,
      email: customer.email,
      mobile: customer.mobile,
      city: "Ahmedabad",
      role: "admin",
    },
  });
  assert.equal(r.data.role, "customer");
  assert.equal(
    (
      await request("/auth/me", {
        method: "PATCH",
        as: "customer",
        body: {
          name: customer.name,
          email: other.email,
          mobile: customer.mobile,
          city: "Ahmedabad",
        },
      })
    ).status,
    409,
  );
  assert.equal(r.data.passwordHash, undefined);
});
test("private documents require owner/admin access", async () => {
  const f = await File.create({
    owner: provider._id,
    kind: "document",
    name: "sample.pdf",
    mime: "application/pdf",
    data: Buffer.from("%PDF-1.4 sample"),
  });
  const r = await sessionFetch(`${url}/files/${f._id}`);
  assert.equal(r.status, 401);
  const otherResponse = await sessionFetch(`${url}/files/${f._id}`, {
    headers: { Cookie: cookies.other },
  });
  assert.equal(otherResponse.status, 403);
  const ownerResponse = await sessionFetch(`${url}/files/${f._id}`, {
    headers: { Cookie: cookies.provider },
  });
  assert.equal(ownerResponse.status, 200);
});
test("new provider requires approval before public listing", async () => {
  const form = new FormData();
  form.append(
    "data",
    JSON.stringify({
      name: "New Provider",
      email: "new@example.com",
      mobile: "9999999988",
      password: "Example123",
      role: "provider",
      terms: true,
      city: "Ahmedabad",
      category: "plumbing",
      area: "Satellite Ahmedabad",
      bio: "A new plumber with extensive household repair experience.",
      experience: 2,
      price: 299,
      skills: ["Repairs"],
    }),
  );
  form.append(
    "document",
    new Blob(["%PDF-1.4 sample supporting document"], {
      type: "application/pdf",
    }),
    "sample.pdf",
  );
  const r = await request("/auth/register", {
    method: "POST",
    body: form,
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.profile.status, "PENDING");
  assert.equal(r.data.profile.documents.length, 1);
  registeredProvider = r.data;
  cookies.registered = r.cookie;
  assert.equal((await request(`/providers/${r.data._id}`)).status, 404);
  assert.equal(
    (
      await request(`/admin/users/${r.data._id}`, {
        method: "PATCH",
        as: "admin",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  assert.equal((await request(`/providers/${r.data._id}`)).status, 200);
});
const registration = (changes = {}) => ({
  name: "Upload Test",
  email: "upload@example.com",
  mobile: "9999999977",
  password: "Example123",
  role: "provider",
  terms: true,
  city: "Ahmedabad",
  category: "plumbing",
  area: "Satellite Ahmedabad",
  bio: "Household plumbing service for the classroom demonstration.",
  experience: 2,
  price: 299,
  ...changes,
});
const registrationForm = (data, bytes) => {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  form.append(
    "document",
    new Blob([bytes], { type: "application/pdf" }),
    "support.pdf",
  );
  return form;
};
test("provider registration without a document creates one pending account", async () => {
  const r = await request("/auth/register", {
    method: "POST",
    body: registration({
      email: "without-documents@example.test",
      mobile: "9999999955",
    }),
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.profile.status, "PENDING");
  assert.equal(r.data.profile.documents.length, 0);
  assert.equal(
    await User.countDocuments({ email: "without-documents@example.test" }),
    1,
  );
});
test("invalid and oversized registration documents are rejected before account creation", async () => {
  const before = await File.countDocuments();
  const invalid = await request("/auth/register", {
    method: "POST",
    body: registrationForm(registration(), "not a PDF"),
  });
  assert.equal(invalid.status, 400);
  const oversized = await request("/auth/register", {
    method: "POST",
    body: registrationForm(registration(), new Uint8Array(3 * 1024 * 1024 + 1)),
  });
  assert.equal(oversized.status, 400);
  assert.match(oversized.data.message, /3 MB/);
  assert.equal(await User.countDocuments({ email: "upload@example.com" }), 0);
  assert.equal(await File.countDocuments(), before);
});
test("duplicate provider registration does not leave an orphan document", async () => {
  const before = await File.countDocuments();
  const r = await request("/auth/register", {
    method: "POST",
    body: registrationForm(
      registration({ email: "new@example.com" }),
      "%PDF-1.4 duplicate test",
    ),
  });
  assert.equal(r.status, 409);
  assert.equal(await File.countDocuments(), before);
});
test("registered document is private to the provider and administrator", async () => {
  const fileId = registeredProvider.profile.documents[0];
  for (const [role, expected] of [
    [null, 401],
    ["customer", 403],
    ["provider", 403],
    ["registered", 200],
    ["admin", 200],
  ]) {
    const r = await sessionFetch(`${url}/files/${fileId}`, {
      headers: role ? { Cookie: cookies[role] } : {},
    });
    assert.equal(r.status, expected);
    if (expected === 200) {
      assert.match(r.headers.get("content-type"), /application\/pdf/);
      assert.match(r.headers.get("content-disposition"), /\.pdf/);
    }
  }
});
test("rejected providers can resubmit a documented profile and customers cannot", async () => {
  await request(`/admin/users/${registeredProvider._id}`, {
    as: "admin",
    method: "PATCH",
    body: { approval: "REJECTED" },
  });
  assert.equal(
    (
      await request("/provider/review-request", {
        as: "customer",
        method: "POST",
      })
    ).status,
    403,
  );
  const r = await request("/provider/review-request", {
    as: "registered",
    method: "POST",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.status, "PENDING");
  assert.equal(
    (
      await request(`/admin/users/${registeredProvider._id}`, {
        as: "admin",
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/auth/me", { as: "registered" })).data.profile.status,
    "APPROVED",
  );
  assert.equal(
    (
      await request("/provider/review-request", {
        as: "registered",
        method: "POST",
      })
    ).status,
    409,
  );
});
test("approval ignores optional documents but never grants access to another owner evidence", async () => {
  const u = await User.findById(registeredProvider._id);
  const own = [...u.profile.documents];
  const foreign = await File.create({
    owner: provider._id,
    kind: "document",
    name: "foreign.pdf",
    mime: "application/pdf",
    data: Buffer.from("%PDF-1.4"),
  });
  u.profile.documents = [foreign._id];
  u.profile.status = "REJECTED";
  await u.save();
  assert.equal(
    (
      await request(`/admin/users/${u._id}`, {
        as: "admin",
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/provider/review-request", {
        as: "registered",
        method: "POST",
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/files/${foreign._id}`, { as: "registered" })).status,
    403,
  );
  u.profile.documents = own;
  u.profile.status = "APPROVED";
  await u.save();
});
test("approved providers may remove an optional document without losing listing approval", async () => {
  const first = registeredProvider.profile.documents[0];
  const removed = await request("/files/" + first, {
    as: "registered",
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.profile.documents.length, 0);
  assert.equal(removed.data.profile.status, "APPROVED");
  const form = new FormData();
  form.append("kind", "document");
  form.append(
    "file",
    new Blob(["%PDF-1.4 replacement"], { type: "application/pdf" }),
    "replacement.pdf",
  );
  const uploaded = await request("/files", {
    as: "registered",
    method: "POST",
    body: form,
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.data.user.profile.documents.length, 1);
});

test("an existing pending account without documents can upload and become approved", async () => {
  const u = await User.create({
    ...registration({ email: "legacy@example.com", mobile: "9999999966" }),
    passwordHash: await bcrypt.hash("Example123", 4),
    profile: {
      category: "plumbing",
      city: "Ahmedabad",
      area: "Satellite Ahmedabad",
      bio: "Existing account awaiting its supporting document.",
      price: 299,
      status: "PENDING",
    },
  });
  const login = await signIn({
    method: "POST",
    body: { identifier: u.email, password: "Example123" },
  });
  assert.equal(login.status, 200);
  cookies.legacy = login.cookie;
  assert.equal(
    (
      await request(`/admin/users/${u._id}`, {
        as: "admin",
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  const form = new FormData();
  form.append("kind", "document");
  form.append(
    "file",
    new Blob(["%PDF-1.4 legacy upload"], { type: "application/pdf" }),
    "legacy.pdf",
  );
  assert.equal(
    (await request("/files", { as: "legacy", method: "POST", body: form }))
      .status,
    201,
  );
  assert.equal(
    (
      await request(`/admin/users/${u._id}`, {
        as: "admin",
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
});
test("concurrent optional-document removals preserve listing approval and ownership", async () => {
  const form = new FormData();
  form.append("kind", "document");
  form.append(
    "file",
    new Blob(["%PDF-1.4 concurrent replacement"], { type: "application/pdf" }),
    "other.pdf",
  );
  const upload = await request("/files", {
    as: "registered",
    method: "POST",
    body: form,
  });
  assert.equal(upload.status, 201);
  const documents = upload.data.user.profile.documents;
  assert.equal(documents.length, 2);
  const results = await Promise.all(
    documents.map((fileId) =>
      request(`/files/${fileId}`, { as: "registered", method: "DELETE" }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200]);
  const me = await request("/auth/me", { as: "registered" });
  assert.equal(me.data.profile.documents.length, 0);
  assert.equal(
    await File.countDocuments({
      _id: { $in: me.data.profile.documents },
      owner: registeredProvider._id,
    }),
    0,
  );
});
test("concurrent approval and optional document removal preserve independent listing and document state", async () => {
  const u = await User.findOne({ email: "legacy@example.com" });
  await request(`/admin/users/${u._id}`, {
    as: "admin",
    method: "PATCH",
    body: { approval: "PENDING" },
  });
  const results = await Promise.all([
    request(`/admin/users/${u._id}`, {
      as: "admin",
      method: "PATCH",
      body: { approval: "APPROVED" },
    }),
    request(`/files/${u.profile.documents[0]}`, {
      as: "legacy",
      method: "DELETE",
    }),
  ]);
  assert.ok(results.every((r) => [200, 400, 409].includes(r.status)));
  const current = await User.findById(u._id);
  if (current.profile.status === "APPROVED")
    assert.equal(
      await File.countDocuments({
        _id: { $in: current.profile.documents },
        owner: current._id,
        kind: "document",
      }),
      0,
    );
});
test("registration rejects an admin role and weak passwords", async () => {
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { role: "admin" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: {
          name: "Bad Password",
          email: "weak@example.com",
          mobile: "9999999911",
          role: "customer",
          city: "Ahmedabad",
          terms: true,
          password: "weak",
          city: "Ahmedabad",
        },
      })
    ).status,
    400,
  );
});
test("disabled categories vanish from marketplace", async () => {
  const c = await Category.findOne();
  await request(`/admin/categories/${c._id}`, {
    method: "PATCH",
    as: "admin",
    body: { enabled: false },
  });
  assert.deepEqual((await request("/providers?city=Ahmedabad")).data, []);
  assert.equal((await request("/categories")).data.length, 0);
  await request(`/admin/categories/${c._id}`, {
    method: "PATCH",
    as: "admin",
    body: { enabled: true },
  });
});
test("pause-bookings setting is enforced by backend", async () => {
  await request("/admin/settings", {
    method: "PATCH",
    as: "admin",
    body: { bookingEnabled: false },
  });
  const r = await request("/bookings", {
    method: "POST",
    as: "customer",
    body: {
      providerId: provider._id,
      date: futureDate(2),
      time: "09:00",
      address: "Example address Ahmedabad",
    },
  });
  assert.equal(r.status, 409);
  await request("/admin/settings", {
    method: "PATCH",
    as: "admin",
    body: { bookingEnabled: true },
  });
});
test("suspended accounts cannot use existing sessions", async () => {
  await request(`/admin/users/${other._id}`, {
    method: "PATCH",
    as: "admin",
    body: { status: "SUSPENDED" },
  });
  assert.equal((await request("/bookings", { as: "other" })).status, 401);
});
test("passwords are hashed in database and absent in public responses", async () => {
  const u = await User.findById(customer._id).select("+passwordHash");
  assert.notEqual(u.passwordHash, "Example123");
  assert.ok(await bcrypt.compare("Example123", u.passwordHash));
  assert.equal(
    (await request("/auth/me", { as: "customer" })).data.passwordHash,
    undefined,
  );
});

test("password changes revoke other sessions and legacy cookies", async () => {
  const user = await User.create({
    name: "Session Test",
    email: "sessions@example.com",
    mobile: "9999999981",
    role: "customer",
    city: "Ahmedabad",
    passwordHash: await bcrypt.hash("Original123", 4),
  });
  const login = await signIn({
    method: "POST",
    body: { identifier: user.email, password: "Original123" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.sessionVersion, undefined);
  cookies.sessionTest = login.cookie;
  cookies.legacySession = `gharseva_session=${jwt.sign(
    { sub: String(user._id) },
    process.env.JWT_SECRET,
    { expiresIn: "8h", algorithm: "HS256" },
  )}`;
  assert.equal(
    (await request("/auth/me", { as: "legacySession" })).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/change-password", {
        method: "POST",
        as: "sessionTest",
        body: { currentPassword: "Original123", newPassword: "Changed123" },
      })
    ).status,
    200,
  );
  for (const as of ["sessionTest", "legacySession"])
    assert.equal((await request("/auth/me", { as })).status, 401);
  assert.equal(
    (
      await signIn({
        method: "POST",
        body: { identifier: user.email, password: "Original123" },
      })
    ).status,
    401,
  );
  const fresh = await signIn({
    method: "POST",
    body: { identifier: user.email, password: "Changed123" },
  });
  assert.equal(fresh.status, 200);
  cookies.freshSession = fresh.cookie;
  const me = await request("/auth/me", { as: "freshSession" });
  assert.equal(me.status, 200);
  assert.equal(me.data.sessionVersion, undefined);
});

test("a rejected password change keeps the current session valid", async () => {
  const user = await User.create({
    name: "Password Test",
    email: "password-test@example.com",
    mobile: "9999999982",
    role: "customer",
    city: "Ahmedabad",
    passwordHash: await bcrypt.hash("Original123", 4),
  });
  const login = await signIn({
    method: "POST",
    body: { identifier: user.email, password: "Original123" },
  });
  assert.equal(login.status, 200);
  cookies.passwordTest = login.cookie;
  assert.equal(
    (
      await request("/auth/change-password", {
        method: "POST",
        as: "passwordTest",
        body: { currentPassword: "Incorrect123", newPassword: "Changed123" },
      })
    ).status,
    400,
  );
  assert.equal((await request("/auth/me", { as: "passwordTest" })).status, 200);
});

test("concurrent password changes cannot both overwrite the same password", async () => {
  const user = await User.create({
    name: "Concurrent Password Test",
    email: "concurrent-password@example.com",
    mobile: "9999999983",
    role: "customer",
    city: "Ahmedabad",
    passwordHash: await bcrypt.hash("Original123", 4),
  });
  const login = await signIn({
    method: "POST",
    body: { identifier: user.email, password: "Original123" },
  });
  assert.equal(login.status, 200);
  cookies.concurrentPassword = login.cookie;
  const results = await Promise.all(
    ["ChangedFirst123", "ChangedSecond123"].map((newPassword) =>
      request("/auth/change-password", {
        method: "POST",
        as: "concurrentPassword",
        body: { currentPassword: "Original123", newPassword },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => [401, 409].includes(r.status)));
  assert.equal((await User.findById(user._id)).sessionVersion, 1);
  assert.equal(
    (await request("/auth/me", { as: "concurrentPassword" })).status,
    401,
  );
});
