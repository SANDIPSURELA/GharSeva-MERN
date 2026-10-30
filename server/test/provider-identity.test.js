import { sessionFetch } from "./session-fixture.js";
import { fixtureCookie } from "./session-fixture.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";
import jwt from "jsonwebtoken";
import {
  createIsolatedMongo,
  connectIsolatedMongo,
} from "../../scripts/isolated-mongo.js";
import { createApp } from "../src/app.js";
import {
  User,
  Category,
  File,
  ProviderIdentity,
  ProviderApplication,
} from "../src/models.js";
import { identityApprovalGuard } from "../src/provider-identity.js";
import {
  compareIdentityNames,
  extractPrimaryName,
} from "../src/identity-name-check.js";
import { readIdentityImages } from "../src/identity-ocr.js";
let db, server, url, provider, other, customer, admin, reading;
const front = await readFile(
  new URL("../../client/public/demo/identity-front.png", import.meta.url),
);
const back = await readFile(
  new URL("../../client/public/demo/identity-back.png", import.meta.url),
);
const cookie = (u) => fixtureCookie(u);
async function call(
  path,
  { as = provider, method = "GET", body, raw = false } = {},
) {
  const r = await sessionFetch(url + path, {
    method,
    headers: {
      "X-GharSeva": "1",
      ...(as ? { Cookie: await cookie(as) } : {}),
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
    data: raw ? Buffer.from(await r.arrayBuffer()) : await r.json(),
    headers: r.headers,
  };
}
function form(extra = {}) {
  const data = new FormData();
  const values = {
    documentType: "AADHAAR_MASKED",
    firstName: "Sandip",
    middleName: "",
    lastName: "Surela",
    consent: "true",
    maskedConfirmed: "true",
    revision: "0",
    ...extra,
  };
  for (const [k, v] of Object.entries(values))
    if (v !== undefined) data.append(k, String(v));
  data.append(
    "front",
    new Blob([front], { type: "image/png" }),
    "private-original-filename.png",
  );
  if (extra.documentType !== "OTHER")
    data.append("back", new Blob([back], { type: "image/png" }), "back.png");
  return data;
}
const submit = (body = form(), as = provider) =>
  call("/provider/identity", { method: "POST", body, as });
const review = (r, extra = {}) =>
  call(`/admin/identities/${provider._id}`, {
    method: "PATCH",
    as: admin,
    body: {
      revision: r.revision,
      action: "REVIEWED",
      note: "Personally checked the name order and original evidence.",
      reviewedName: "Surela Sandip Rajubhai",
      humanReviewed: true,
      ...extra,
    },
  });
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  delete process.env.IDENTITY_STORAGE_KEY;
  db = await createIsolatedMongo();
  await connectIsolatedMongo(db);
  await Promise.all([
    User.init(),
    File.init(),
    ProviderIdentity.init(),
    ProviderApplication.init(),
  ]);
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
});
beforeEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  process.env.NODE_ENV = "test";
  delete process.env.IDENTITY_STORAGE_KEY;
  await Promise.all([
    User.deleteMany({}),
    File.deleteMany({}),
    ProviderIdentity.deleteMany({}),
    ProviderApplication.deleteMany({}),
  ]);
  await Category.updateOne(
    { slug: "plumbing" },
    { $set: { name: "Plumbing", enabled: true } },
    { upsert: true },
  );
  reading = {
    frontText: "CLASSROOM SAMPLE\nName: Surela Sandip Rajubhai\nNot valid ID",
    backText: "Fictional back",
    confidence: 94,
  };
  [provider, other, customer, admin] = await User.create([
    {
      name: "Sandip Surela",
      city: "Ahmedabad",
      email: "provider@example.com",
      mobile: "9876500101",
      passwordHash: "test-only",
      role: "provider",
      profile: {
        category: "plumbing",
        city: "Ahmedabad",
        area: "Satellite",
        bio: "A normal plumbing service profile for isolated test fixtures.",
        price: 349,
        status: "PENDING",
        identityRequired: true,
      },
    },
    {
      name: "Other Professional",
      email: "other@example.com",
      mobile: "9876500102",
      passwordHash: "test-only",
      role: "provider",
      profile: { category: "plumbing", status: "PENDING" },
    },
    {
      name: "Demo Customer",
      email: "customer@example.com",
      mobile: "9876500103",
      passwordHash: "test-only",
      role: "customer",
    },
    {
      name: "Demo Admin",
      email: "admin@example.com",
      mobile: "9876500104",
      passwordHash: "test-only",
      role: "admin",
    },
  ]);
  const file = await File.create({
    owner: provider._id,
    kind: "document",
    name: "sample.pdf",
    mime: "application/pdf",
    data: Buffer.from("%PDF-fixture"),
  });
  provider.profile.documents = [file._id];
  await provider.save();
  await ProviderApplication.create({
    contactKey: "test-key",
    user: provider._id,
    state: "SUBMITTED",
    revision: 1,
    data: { name: provider.name },
  });
  server = createApp({ identityOcr: async () => reading }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}/api`;
});
test("name comparisons handle order and middle components without approving applicants", () => {
  for (const name of [
    "Surela Sandip Rajubhai",
    "SANDIP SURELA",
    "surela, sandip",
  ])
    assert.equal(
      compareIdentityNames("Sandip Surela", name).status,
      "CONSISTENT",
    );
  for (const name of ["Sandeep Surela", "S. Surela"])
    assert.equal(compareIdentityNames("Sandip Surela", name).status, "REVIEW");
  assert.equal(
    compareIdentityNames("Sandip Surela", "Other Person").status,
    "DISCREPANCY",
  );
  assert.equal(compareIdentityNames("Sandip Surela", "").status, "UNREADABLE");
  assert.equal(
    compareIdentityNames("Sandip Surela", "Sandip Surela", 30).status,
    "REVIEW",
  );
  assert.equal(
    compareIdentityNames("Sandip Sandip", "Sandip Surela").status,
    "REVIEW",
  );
  assert.equal(compareIdentityNames("Sandip", "Sandip").status, "REVIEW");
});
test("primary name extraction avoids relatives, addresses and ambiguous lines", () => {
  assert.equal(
    extractPrimaryName(
      "Name: Surela Sandip Rajubhai\nC/O: Other Name",
      "Sandip Surela",
    ),
    "Surela Sandip Rajubhai",
  );
  assert.equal(
    extractPrimaryName(
      "C/O: Sandip Surela\nAddress: Classroom Lane",
      "Sandip Surela",
    ),
    "",
  );
  assert.equal(
    extractPrimaryName("Other Person\nAnother Person", "Sandip Surela"),
    "",
  );
  assert.equal(extractPrimaryName("Name: 9999 9999 9999", "Sandip Surela"), "");
});
test("actual local OCR reads the clearly labelled fictional fixture", async () => {
  const result = await readIdentityImages(front, back);
  assert.match(result.frontText, /Surela Sandip Rajubhai/i);
  assert.equal(
    extractPrimaryName(result.frontText, "Sandip Surela"),
    "Surela Sandip Rajubhai",
  );
});
test("only providers can submit and inspect their own evidence", async () => {
  assert.equal((await submit(form(), null)).status, 401);
  assert.equal((await submit(form(), customer)).status, 403);
  assert.equal((await submit(form(), admin)).status, 403);
  const r = await submit();
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(
    (await call("/provider/identity", { as: other })).data.record,
    null,
  );
  assert.equal((await call("/admin/identities", { as: provider })).status, 403);
});
test("requires recorded consent, masked confirmation and both Aadhaar sides", async () => {
  assert.equal((await submit(form({ consent: "false" }))).status, 400);
  assert.equal((await submit(form({ maskedConfirmed: "false" }))).status, 400);
  const body = form();
  body.delete("back");
  assert.equal((await submit(body)).status, 400);
  assert.equal(await ProviderIdentity.countDocuments(), 0);
  assert.equal(await File.countDocuments({ kind: "identity" }), 0);
});
test("alternative evidence permits one side and does not require Aadhaar", async () => {
  const r = await submit(
    form({ documentType: "OTHER", maskedConfirmed: "false" }),
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.record.images.length, 1);
});
test("private images are encrypted, metadata stripped and inaccessible on public file routes", async () => {
  const r = await submit();
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const record = r.data.record;
  assert.equal(record.check.status, "CONSISTENT");
  assert.equal(record.authenticity, "NOT_VERIFIED");
  assert.equal(record.state, "SUBMITTED");
  assert.equal((await User.findById(provider._id)).profile.status, "PENDING");
  const file = await File.findOne({ kind: "identity" }).select(
    "+data +iv +tag",
  );
  assert.notEqual(file.name, "private-original-filename.png");
  assert.ok(file.iv && file.tag);
  assert.notDeepEqual(file.data.subarray(0, 8), front.subarray(0, 8));
  assert.ok(file.expiresAt > Date.now() + 29 * 86400000);
  assert.equal(JSON.stringify(record).includes("frontText"), false);
  const path = record.images[0].url.replace("/api", "");
  assert.equal((await call(path, { as: null })).status, 401);
  assert.equal((await call(path, { as: other })).status, 404);
  assert.equal((await call(path, { as: customer })).status, 404);
  for (const as of [provider, admin]) {
    const image = await call(path, { as, raw: true });
    assert.equal(image.status, 200);
    assert.match(image.headers.get("cache-control"), /no-store/);
    assert.deepEqual(image.data.subarray(0, 8), front.subarray(0, 8));
  }
  assert.equal((await call(`/files/${file._id}`, { as: admin })).status, 404);
  assert.equal(
    (await call(`/files/${file._id}`, { method: "DELETE" })).status,
    403,
  );
});
test("full 12-digit numbers detected by OCR are refused before storage on either side", async () => {
  for (const side of ["frontText", "backText"]) {
    const original = reading[side];
    reading[side] += "\n9999 9999 9999";
    const r = await submit();
    assert.equal(r.status, 400);
    reading[side] = original;
  }
  assert.equal(await File.countDocuments({ kind: "identity" }), 0);
  assert.equal(await ProviderIdentity.countDocuments(), 0);
});
test("unreadable, mismatched and low-confidence names stay pending for human review", async () => {
  for (const [frontText, confidence, status] of [
    ["??", 20, "UNREADABLE"],
    ["Name: Other Person", 95, "DISCREPANCY"],
    ["Name: Surela Sandip Rajubhai", 35, "REVIEW"],
  ]) {
    await ProviderIdentity.deleteMany({});
    reading = { frontText, backText: "", confidence };
    const r = await submit();
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.record.check.status, status);
    assert.equal(r.data.record.state, "SUBMITTED");
    assert.equal((await User.findById(provider._id)).profile.status, "PENDING");
  }
});
test("invalid images, unsupported types and undersized images are refused", async () => {
  const invalid = form();
  invalid.set(
    "front",
    new Blob([Buffer.from("not an image")], { type: "image/png" }),
    "fake.png",
  );
  assert.equal((await submit(invalid)).status, 400);
  const small = form();
  small.set(
    "front",
    new Blob(
      [
        await sharp({
          create: { width: 100, height: 60, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      ],
      { type: "image/png" },
    ),
    "too-small.png",
  );
  assert.equal((await submit(small)).status, 400);
  const unsupported = form({ documentType: "PASSPORT" });
  assert.equal((await submit(unsupported)).status, 400);
});
test("human review requires reason, original evidence, manual confirmation and a name", async () => {
  const r = (await submit()).data.record;
  assert.equal((await review(r, { humanReviewed: false })).status, 400);
  assert.equal((await review(r, { note: "ok" })).status, 400);
  assert.equal((await review(r, { reviewedName: "999999999999" })).status, 400);
  const done = await review(r);
  assert.equal(done.status, 200);
  assert.equal(done.data.record.state, "REVIEWED");
  assert.ok(done.data.record.reviewedAt);
  assert.equal((await User.findById(provider._id)).profile.status, "PENDING");
  assert.ok(done.data.record.history.some((h) => h.action === "REVIEWED"));
});
test("correction requests are recorded and replacement resets the review", async () => {
  const initial = (await submit()).data.record;
  const corrected = await review(initial, {
    action: "NEEDS_CORRECTION",
    humanReviewed: false,
    note: "Please upload a clearer front image with the full name visible.",
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.record.state, "NEEDS_CORRECTION");
  const replacement = await submit(
    form({ revision: corrected.data.record.revision }),
  );
  assert.equal(replacement.status, 201);
  assert.equal(replacement.data.record.state, "SUBMITTED");
  assert.equal(replacement.data.record.reviewedAt, undefined);
  assert.equal(await File.countDocuments({ kind: "identity" }), 2);
});
test("stale uploads, stale reviewer decisions and changed account names are blocked", async () => {
  const initial = (await submit()).data.record;
  assert.equal((await submit()).status, 409);
  const done = (await review(initial)).data.record;
  assert.equal((await review(initial)).status, 409);
  await User.updateOne(
    { _id: provider._id },
    { $set: { name: "Changed Account Name" } },
  );
  assert.equal((await review(done)).status, 409);
});
test("simultaneous reviewer decisions record only one winning revision", async () => {
  const initial = (await submit()).data.record;
  const results = await Promise.all([
    review(initial),
    review(initial, { action: "NEEDS_CORRECTION" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("removal withdraws evidence, preserves audit and cannot affect another provider", async () => {
  const initial = (await submit()).data.record;
  assert.equal(
    (
      await call("/provider/identity", {
        as: other,
        method: "DELETE",
        body: { revision: initial.revision },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/provider/identity", {
        method: "DELETE",
        body: { revision: initial.revision },
      })
    ).status,
    200,
  );
  assert.equal(await File.countDocuments({ kind: "identity" }), 0);
  const record = await ProviderIdentity.findOne({ provider: provider._id });
  assert.equal(record.state, "WITHDRAWN");
  assert.equal(record.check.extractedName, undefined);
  assert.ok(record.history.some((h) => h.action === "WITHDRAWN"));
});
test("ordinary admin approval is independent of optional identity records and preserves them", async () => {
  const submitted = (await submit()).data.record;
  const application = await ProviderApplication.findOne({ user: provider._id });
  assert.equal(
    (
      await call("/admin/users/" + provider._id, {
        as: admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  const current = await ProviderApplication.findById(application._id);
  assert.equal(
    (
      await call("/admin/applications/" + current._id, {
        as: admin,
        method: "PATCH",
        body: { action: "APPROVED", revision: current.revision },
      })
    ).status,
    200,
  );
  assert.equal((await User.findById(provider._id)).profile.status, "APPROVED");
  const retained = await ProviderIdentity.findOne({ provider: provider._id });
  assert.equal(retained.state, "SUBMITTED");
  assert.equal(retained.revision, submitted.revision);
});

test("expired optional evidence stays private without blocking normal listing approval", async () => {
  const initial = (await submit()).data.record;
  const done = (await review(initial)).data.record;
  await File.updateMany(
    { kind: "identity" },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (await call(done.images[0].url.replace("/api", ""), { raw: false })).status,
    404,
  );
  assert.equal(
    (
      await call(`/admin/users/${provider._id}`, {
        as: admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
});
test("approval lock blocks competing evidence changes and is released explicitly", async () => {
  const initial = (await submit()).data.record,
    done = (await review(initial)).data.record;
  const release = await identityApprovalGuard(
    await User.findById(provider._id),
  );
  assert.equal((await submit(form({ revision: done.revision }))).status, 409);
  assert.equal(
    (
      await call("/provider/identity", {
        method: "DELETE",
        body: { revision: done.revision },
      })
    ).status,
    409,
  );
  await release();
  assert.equal((await submit(form({ revision: done.revision }))).status, 201);
});
test("production upload refuses an absent encryption key without storing evidence", async () => {
  process.env.NODE_ENV = "production";
  const r = await submit();
  assert.equal(r.status, 503);
  assert.equal(await File.countDocuments({ kind: "identity" }), 0);
  process.env.NODE_ENV = "test";
});
test("legacy providers can retain existing approval behavior without a new identity requirement", async () => {
  provider.profile.identityRequired = false;
  await provider.save();
  assert.equal(
    (
      await call(`/admin/users/${provider._id}`, {
        as: admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
});

test("changing the typed identity name cannot hide a registration-name discrepancy", async () => {
  reading = { frontText: "Name: Other Person", backText: "", confidence: 95 };
  const r = await submit(form({ firstName: "Other", lastName: "Person" }));
  assert.equal(r.status, 201);
  assert.equal(r.data.record.check.accountStatus, "DISCREPANCY");
  assert.equal(r.data.record.check.status, "REVIEW");
});
test("upload throttling is enforced without retaining unconsented images", async () => {
  let result;
  for (let i = 0; i < 9; i++) result = await submit(form({ consent: "false" }));
  assert.equal(result.status, 429);
  assert.equal(await File.countDocuments({ kind: "identity" }), 0);
});

test("new registration needs no identity review and cannot promote its own pending profile", async () => {
  await Category.updateOne(
    { slug: "plumbing" },
    { $set: { name: "Plumbing", enabled: true } },
    { upsert: true },
  );
  const body = new FormData();
  body.append(
    "document",
    new Blob([front], { type: "image/png" }),
    "qualification.png",
  );
  body.append(
    "data",
    JSON.stringify({
      name: "New Sample Professional",
      email: "new-professional@example.com",
      mobile: "9876500199",
      password: "Classroom123!",
      role: "provider",
      terms: true,
      identityWorkflow: true,
      category: "plumbing",
      categories: ["plumbing"],
      city: "Ahmedabad",
      area: "Fictional classroom area",
      bio: "A fictional service description used only for software testing.",
      experience: 3,
      price: 349,
      skills: ["General service"],
    }),
  );
  const result = await call("/auth/register", {
    method: "POST",
    body,
    as: null,
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.profile.identityRequired, false);
  assert.equal(result.data.profile.status, "PENDING");
  const edited = await call("/auth/me", {
    method: "PATCH",
    as: result.data,
    body: {
      name: result.data.name,
      email: result.data.email,
      mobile: result.data.mobile,
      city: "Ahmedabad",
      profile: {
        category: "plumbing",
        categories: ["plumbing"],
        city: "Ahmedabad",
        area: "Fictional classroom area",
        bio: "A fictional service description used only for software testing.",
        experience: 3,
        price: 349,
        skills: ["General service"],
        identityRequired: false,
      },
    },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.profile.identityRequired, false);
  assert.equal(
    (
      await call(`/admin/users/${result.data._id}`, {
        as: admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
});
