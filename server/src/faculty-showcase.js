import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { User, Category, Settings, File } from "./models.js";
import { auth, role } from "./auth.js";
import { fail } from "./domain.js";
import { demoDefinitions, stableId } from "./owner-demo-providers.js";
import { canonicalCity } from "../../shared/cities.js";
import { publicWorkImageView } from "../../shared/work-images.js";

export const facultyLabel = "DEMO PROFILE — Fictional, not identity verified";
export const facultyConfirmation = (enabled) =>
  `${enabled ? "ENABLE" : "DISABLE"} FACULTY DEMO SHOWCASE`;
const database = () => mongoose.connection.name;
export const ownerImportedDemo = (u, db = database()) =>
  demoDefinitions.some(
    (p) =>
      u.demoAccountId === "owner-demo:" + p.id ||
      String(u._id) === stableId(db, p.id),
  );
export const facultyCandidateQuery = (db) => ({
  $or: [
    { _id: { $in: demoDefinitions.map((p) => stableId(db, p.id)) } },
    {
      demoAccountId: { $in: demoDefinitions.map((p) => "owner-demo:" + p.id) },
    },
    { "profile.demoProviderId": { $in: demoDefinitions.map((p) => p.id) } },
  ],
});
export function inspectFacultyAccounts(users, categories, db) {
  const eligible = [],
    issues = [];
  for (const p of demoDefinitions) {
    const expected = stableId(db, p.id),
      marker = "owner-demo:" + p.id;
    const matches = users.filter(
      (u) =>
        String(u._id) === expected ||
        u.demoAccountId === marker ||
        u.profile?.demoProviderId === p.id,
    );
    const u = matches[0];
    if (
      matches.length !== 1 ||
      String(u?._id) !== expected ||
      u.demoAccountId !== marker ||
      u.role !== "provider" ||
      u.status !== "ACTIVE" ||
      u.profile?.demoProviderId !== p.id ||
      u.profile.status !== "PENDING" ||
      u.profile.identityRequired !== true ||
      canonicalCity(u.city) !== "Ahmedabad" ||
      canonicalCity(u.profile.city) !== "Ahmedabad" ||
      u.profile.category !== p.serviceId ||
      !Array.isArray(u.profile.categories) ||
      u.profile.categories.length !== 1 ||
      u.profile.categories[0] !== p.serviceId ||
      !Array.isArray(u.profile.documents) || u.profile.documents.length !== 0
    ) {
      issues.push({
        demoId: p.id,
        reason:
          matches.length > 1
            ? "ambiguous"
            : !matches.length
              ? "missing"
              : "mismatch",
      });
    } else eligible.push(u);
  }
  const enabled = categories
    .filter((c) => c.enabled === true)
    .map((c) => c.slug);
  const counts = Object.fromEntries(
    [...new Set(demoDefinitions.map((p) => p.serviceId))].map((slug) => [
      slug,
      eligible.filter(
        (u) =>
          u.profile.category === slug &&
          u.profile.available &&
          enabled.includes(slug),
      ).length,
    ]),
  );
  // Only a bounded projection enters the fingerprint; no credentials/documents.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        users
          .map((u) => [
            String(u._id),
            u.role,
            u.status,
            u.demoAccountId,
            u.city,
            u.profile,
          ])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    )
    .digest("hex");
  return { eligible, issues, categoryCounts: counts, fingerprint };
}
const candidates = () =>
  User.find(facultyCandidateQuery(database()))
    .select("_id role status demoAccountId city profile")
    .lean();
export async function facultyPreview(enabled) {
  const [state, users, categories] = await Promise.all([
    Settings.findOne({ key: "main" }).lean(),
    candidates(),
    Category.find({}).select("slug enabled").lean(),
  ]);
  const manifest = inspectFacultyAccounts(users, categories, database());
  return {
    enabled: state?.facultyDemoEnabled === true,
    requestedEnabled: enabled,
    revision: state?.facultyDemoRevision || 0,
    expectedCount: 20,
    eligibleCount: manifest.eligible.length,
    issues: manifest.issues,
    categoryCounts: manifest.categoryCounts,
    fingerprint: manifest.fingerprint,
    canEnable: manifest.issues.length === 0 && manifest.eligible.length === 20,
    databaseWrites: 0,
    confirmation: facultyConfirmation(enabled),
  };
}
export async function changeFacultyShowcase(actor, body) {
  if (actor?.role !== "admin") fail(403, "Administrator access required.");
  if (
    !body || typeof body.enabled !== "boolean" ||
    body.confirmation !== facultyConfirmation(body.enabled)
  )
    fail(400, "Preview and explicitly confirm the showcase operation.");
  const preview = await facultyPreview(body.enabled);
  if (body.enabled && !preview.canEnable)
    fail(
      409,
      "All 20 exact imported pending demo accounts must match before enabling.",
    );
  if (preview.enabled === body.enabled) return { ...preview, unchanged: true };
  if (
    body.revision !== preview.revision ||
    (body.enabled && body.fingerprint !== preview.fingerprint)
  )
    fail(409, "Showcase data changed. Preview again.");
  const at = new Date();
  const updated = await Settings.findOneAndUpdate(
    {
      key: "main",
      ...(preview.revision === 0
        ? {
            $or: [
              { facultyDemoRevision: 0 },
              { facultyDemoRevision: { $exists: false } },
            ],
          }
        : { facultyDemoRevision: preview.revision }),
    },
    {
      $set: { facultyDemoEnabled: body.enabled },
      $inc: { facultyDemoRevision: 1 },
      $push: {
        facultyDemoAudit: {
          $each: [
            {
              enabled: body.enabled,
              at,
              actor: actor._id,
              revision: preview.revision + 1,
            },
          ],
          $slice: -50,
        },
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated)
    fail(
      409,
      "Settings changed or are missing. Preview again; no account was changed.",
    );
  return {
    enabled: updated.facultyDemoEnabled,
    revision: updated.facultyDemoRevision,
    unchanged: false,
  };
}
export async function facultyPublicProviders(filter = {}) {
  const state = await Settings.findOne({ key: "main" })
    .select("facultyDemoEnabled")
    .lean();
  if (state?.facultyDemoEnabled !== true) return [];
  const [users, categories] = await Promise.all([
    candidates(),
    Category.find({ enabled: true }).lean(),
  ]);
  const { eligible } = inspectFacultyAccounts(users, categories, database());
  const selected = await User.find({
    $and: [{ _id: { $in: eligible.map((u) => u._id) } }, filter],
  })
    .select("_id name role status demoAccountId city profile")
    .lean();
  const files = await File.find({
    owner: { $in: selected.map((u) => u._id) },
    kind: "portfolio",
  })
    .select("_id owner kind")
    .lean();
  // Revalidate selected records in case an account changed between reads.
  return selected
    .filter(
      (u) =>
        inspectFacultyAccounts([u], categories, database()).eligible.length ===
          1 &&
        u.profile.available &&
        categories.some((c) => c.slug === u.profile.category),
    )
    .map((u) => {
      const cat = categories.find((c) => c.slug === u.profile.category);
      return {
        _id: u._id,
        name: u.name,
        city: "Ahmedabad",
        area: u.profile.area,
        bio: "Faculty demonstration only. Fictional professional; identity has not been verified.",
        category: cat.slug,
        categories: [cat.slug],
        categoryName: cat.name,
        categoryNames: [cat.name],
        price: u.profile.price,
        available: true,
        days: u.profile.days,
        slots: [],
        skills: [],
        experience: 0,
        rating: 0,
        reviews: 0,
        completed: 0,
        ...publicWorkImageView(u, files),
        facultyDemo: true,
        facultyDemoLabel: facultyLabel,
        bookingAllowed: false,
      };
    });
}
export function mountFacultyShowcase(app) {
  app.get(
    "/api/admin/faculty-showcase",
    auth,
    role("admin"),
    async (req, res) =>
      res.json(await facultyPreview(req.query.enabled === "1")),
  );
  app.post(
    "/api/admin/faculty-showcase",
    auth,
    role("admin"),
    async (req, res) =>
      res.json(await changeFacultyShowcase(req.user, req.body)),
  );
}
