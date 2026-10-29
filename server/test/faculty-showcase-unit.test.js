import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectFacultyAccounts,
  ownerImportedDemo,
} from "../src/faculty-showcase.js";
import { demoDefinitions, stableId } from "../src/owner-demo-providers.js";
import { canonicalCatalog } from "../src/canonical-catalog.js";
import { matchProviders } from "../src/assistant-matching.js";
const db = "gharseva_showcase_unit";
const fixtures = () =>
  demoDefinitions.map((p) => ({
    _id: stableId(db, p.id),
    role: "provider",
    status: "ACTIVE",
    demoAccountId: "owner-demo:" + p.id,
    city: "Ahmedabad",
    profile: {
      demoProviderId: p.id,
      category: p.serviceId,
      categories: [p.serviceId],
      city: "Ahmedabad",
      status: "PENDING",
      identityRequired: true,
      documents: [],
      available: true,
    },
  }));
test("exact twenty imported identities cover two per enabled category", () => {
  const users = fixtures(),
    before = JSON.stringify(users),
    report = inspectFacultyAccounts(users, canonicalCatalog, db);
  assert.equal(report.eligible.length, 20);
  assert.equal(report.issues.length, 0);
  assert.equal(Object.keys(report.categoryCounts).length, 10);
  assert.ok(Object.values(report.categoryCounts).every((n) => n === 2));
  assert.equal(JSON.stringify(users), before);
});
test("email domain never authorizes showcase visibility; stable id AND markers are required", () => {
  for (const change of [
    (u) => (u._id = "aaaaaaaaaaaaaaaaaaaaaaaa"),
    (u) => (u.demoAccountId = "real"),
    (u) => (u.profile.demoProviderId = "other"),
    (u) => (u.role = "admin"),
    (u) => (u.profile.status = "APPROVED"),
    (u) => (u.profile.identityRequired = false),
    (u) => (u.profile.documents = ["fake"]),
    (u) => (u.status = "SUSPENDED"),
    (u) => u.profile.categories.push("electrical"),
  ]) {
    const users = fixtures();
    change(users[0]);
    const report = inspectFacultyAccounts(users, canonicalCatalog, db);
    assert.equal(report.eligible.length, 19);
    assert.equal(report.issues.length, 1);
  }
});
test("Ahmedabad normalization accepts alias, other cities and duplicate markers are refused", () => {
  const users = fixtures();
  users[0].city = " Ahemdabad ";
  users[0].profile.city = " ahmedabad ";
  assert.equal(
    inspectFacultyAccounts(users, canonicalCatalog, db).eligible.length,
    20,
  );
  users[0].profile.city = "Pune";
  assert.equal(
    inspectFacultyAccounts(users, canonicalCatalog, db).eligible.length,
    19,
  );
  const duplicate = { ...users[1], _id: "bbbbbbbbbbbbbbbbbbbbbbbb" };
  users.push(duplicate);
  assert.ok(
    inspectFacultyAccounts(users, canonicalCatalog, db).issues.some(
      (i) => i.reason === "ambiguous",
    ),
  );
});
test("disabled categories and unavailable profiles are not counted as displayable", () => {
  const users = fixtures(),
    cats = canonicalCatalog.map((c) => ({
      ...c,
      enabled: c.slug !== "plumbing",
    }));
  const report = inspectFacultyAccounts(users, cats, db);
  assert.equal(report.categoryCounts.plumbing, 0);
  users.find((u) => u.profile.category === "electrical").profile.available =
    false;
  assert.equal(
    inspectFacultyAccounts(users, cats, db).categoryCounts.electrical,
    1,
  );
});
test("only imported accounts are blocked from ordinary booking, classroom fixtures remain separate", () => {
  assert.equal(ownerImportedDemo(fixtures()[0], db), true);
  assert.equal(
    ownerImportedDemo(
      { _id: "random", profile: { demoProviderId: demoDefinitions[0].id } },
      db,
    ),
    false,
  );
});
test("assistant showcase options make no claim of actual free slots", () => {
  const p = {
    _id: "test",
    facultyDemo: true,
    facultyDemoLabel: "DEMO PROFILE",
    available: true,
    city: "Ahmedabad",
    category: "plumbing",
    name: "Demo",
    price: 299,
    rating: 0,
    reviews: 0,
  };
  const result = matchProviders(
    [p],
    { slug: "plumbing" },
    { city: "Ahmedabad" },
    [],
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].availability.slots, []);
  assert.ok(
    result[0].reasons.includes(
      "Display only. Bookings and payments are disabled.",
    ),
  );
  assert.equal(
    matchProviders([p], { slug: "plumbing" }, { city: "Ahmedabad" }, [], {
      bookingEnabled: false,
    }).length,
    1,
  );
});
