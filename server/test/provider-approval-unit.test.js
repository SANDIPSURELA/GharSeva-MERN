// Actual policy/middleware over mocked catalog reads; no MongoDB or delivery.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  providerApprovalRequirements,
  providerDiscoveryReadiness,
} from "../src/provider-approval.js";
import { adminReview, requireRecentAdmin } from "../src/auth.js";

const user = () => ({
  _id: "0123456789abcdef01234567",
  name: "Fixture Provider",
  email: "fixture@example.test",
  mobile: "9876500123",
  city: "Ahmedabad",
  role: "provider",
  status: "ACTIVE",
  profile: {
    city: "Ahmedabad",
    category: "plumbing",
    area: "Satellite",
    bio: "Residential plumbing service profile for isolated testing.",
    price: 349,
    identityRequired: true,
    documents: [],
  },
});
test("admin approval eligibility is independent of optional profile, cities, price, experience and account availability", async () => {
  for (const change of [
    (u) => (u.profile = {}),
    (u) => (u.city = ""),
    (u) => {
      u.city = "Surat";
      u.profile.city = "Ahmedabad";
    },
    (u) => (u.status = "SUSPENDED"),
    (u) => (u.profile.price = undefined),
    (u) => (u.profile.bio = ""),
    (u) => (u.profile.experience = undefined),
    (u) => (u.profile.documents = []),
  ]) {
    const u = user();
    change(u);
    const before = JSON.stringify(u);
    assert.deepEqual(await providerApprovalRequirements(u), {
      ready: true,
      issues: [],
    });
    assert.equal(JSON.stringify(u), before);
  }
  for (const u of [
    null,
    { ...user(), role: "customer" },
    { ...user(), demoAccountId: "owner-demo:ahm-plumbing-1" },
  ])
    assert.equal((await providerApprovalRequirements(u)).ready, false);
});
test("discovery requires actual booking data, independently of approval and account-city matching", () => {
  const u = user();
  u.profile.status = "APPROVED";
  u.profile.available = true;
  u.profile.days = [1, 2];
  u.profile.slots = ["09:00"];
  const cats = [{ slug: "plumbing", enabled: true }];
  u.city = "Surat";
  u.profile.area = "";
  u.profile.bio = "";
  u.profile.experience = undefined;
  assert.equal(providerDiscoveryReadiness(u, cats).ready, true);
  u.profile.city = "  Ahemdabad ";
  assert.equal(providerDiscoveryReadiness(u, cats).ready, true);
  for (const change of [
    (u) => (u.profile.price = undefined),
    (u) => (u.profile.city = ""),
    (u) => (u.profile.category = "unknown"),
    (u) => (u.profile.days = []),
    (u) => (u.profile.slots = []),
    (u) => (u.profile.price = 123.456),
    (u) => (u.status = "SUSPENDED"),
    (u) => (u.profile.status = "PENDING"),
    (u) => (u.demoAccountId = "owner-demo:ahm-plumbing-1"),
  ]) {
    const v = structuredClone(u);
    change(v);
    const r = providerDiscoveryReadiness(v, cats);
    assert.equal(r.ready, false);
    assert.equal(r.message, "Complete service details to appear in searches.");
  }
  assert.equal(
    providerDiscoveryReadiness(u, [{ slug: "plumbing", enabled: false }]).ready,
    false,
  );
});

test("ordinary admin reviews reuse verified login proof; sensitive actions retain short-lived proof", () => {
  const req = {
    user: { role: "admin", loginRevision: 7 },
    authSession: {
      reauthenticatedAt: new Date(Date.now() - 6 * 60000),
      reauthRevision: 7,
    },
  };
  const review = () => {
    let error;
    adminReview(req, {}, (e) => {
      error = e;
    });
    return error;
  };
  for (let i = 0; i < 3; i++) assert.equal(review(), undefined);
  assert.throws(() => requireRecentAdmin(req), { code: "REAUTH_REQUIRED" });
  req.user.loginRevision++;
  assert.equal(review().code, "REAUTH_REQUIRED");
  req.authSession.reauthRevision++;
  for (const proof of [null, new Date(NaN), new Date(Date.now() + 60000)]) {
    req.authSession.reauthenticatedAt = proof;
    assert.equal(review().code, "REAUTH_REQUIRED");
  }
  for (const role of ["customer", "provider"]) {
    req.user.role = role;
    assert.equal(review().status, 403);
  }
});
