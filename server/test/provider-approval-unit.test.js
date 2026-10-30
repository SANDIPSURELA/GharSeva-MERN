// Actual policy/middleware over mocked catalog reads; no MongoDB or delivery.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { providerApprovalRequirements } from "../src/provider-identity.js";
import { adminReview, requireRecentAdmin } from "../src/auth.js";
import { Category } from "../src/models.js";
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
test("ordinary approval needs a complete active service profile, not documents or identity proof", async () => {
  const read = mock.method(Category, "exists", async () => ({
    _id: "fixture-category",
  }));
  try {
    const u = user(),
      before = JSON.stringify(u);
    assert.deepEqual(await providerApprovalRequirements(u), {
      ready: true,
      issues: [],
    });
    assert.equal(JSON.stringify(u), before);
    for (const alter of [
      (u) => (u.role = "customer"),
      (u) => (u.status = "SUSPENDED"),
      (u) => (u.mobile = ""),
      (u) => (u.city = "unknown"),
      (u) => (u.profile.bio = ""),
      (u) => (u.profile.price = 1),
      (u) => (u.profile.area = ""),
      (u) => (u.demoAccountId = "owner-demo:ahm-plumbing-1"),
    ]) {
      const v = user();
      alter(v);
      assert.equal((await providerApprovalRequirements(v)).ready, false);
    }
    read.mock.mockImplementation(async () => null);
    assert.equal((await providerApprovalRequirements(user())).ready, false);
  } finally {
    read.mock.restore();
  }
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
