import { canonicalCatalog } from "./canonical-catalog.js";

const normalized = (s) =>
  typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "";
const slugIndex = (i) =>
  Object.keys(i.key || {}).length === 1 && i.key.slug === 1;
export function inspectCatalog(rows, indexes = []) {
  const report = {
    missing: [],
    existingEnabled: [],
    existingDisabled: [],
    preservedCustom: [],
    conflicts: [],
  };
  const seen = new Set();
  for (const row of rows) {
    const key = normalized(row.slug);
    if (!key || seen.has(key))
      report.conflicts.push({
        slug: key || "(invalid)",
        reason: "Duplicate or invalid normalized slug.",
      });
    seen.add(key);
    if (
      typeof row.name !== "string" ||
      !row.name.trim() ||
      !Number.isFinite(row.price) ||
      row.price < 100 ||
      typeof row.enabled !== "boolean"
    )
      report.conflicts.push({
        slug: key,
        reason: "Invalid name, price or enabled state; requires review.",
      });
    if (!canonicalCatalog.some((c) => c.slug === key))
      report.preservedCustom.push({ slug: key });
  }
  for (const category of canonicalCatalog) {
    const matches = rows.filter(
      (row) => normalized(row.slug) === category.slug,
    );
    if (!matches.length) {
      report.missing.push({ ...category });
      if (
        rows.some((row) => normalized(row.name) === normalized(category.name))
      )
        report.conflicts.push({
          slug: category.slug,
          reason:
            "Canonical label exists under another slug; preserve references and review.",
        });
    } else {
      if (matches.some((row) => row.slug !== category.slug))
        report.conflicts.push({
          slug: category.slug,
          reason:
            "Noncanonical slug spelling; review before inserting an alias.",
        });
      for (const row of matches)
        (row.enabled === false
          ? report.existingDisabled
          : report.existingEnabled
        ).push({ slug: row.slug, id: String(row._id) });
    }
  }
  for (const index of indexes)
    if (
      (slugIndex(index) &&
        (!index.unique ||
          index.sparse ||
          index.partialFilterExpression ||
          index.collation)) ||
      (index.name === "slug_1" && !slugIndex(index))
    )
      report.conflicts.push({
        slug: "(index)",
        reason: "Conflicting slug index definition requires review.",
      });
  return report;
}
export async function reconcileCatalog(
  collection,
  { apply = false, confirmedDatabase } = {},
) {
  if (apply && (!confirmedDatabase || collection.dbName !== confirmedDatabase))
    throw Error(
      "Catalog apply requires the exact connected database name. No changes made.",
    );
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (e) {
    if (e.code === 26 || e.codeName === "NamespaceNotFound") indexes = [];
    else throw e;
  }
  const rows = await collection.find({}).toArray();
  const report = inspectCatalog(rows, indexes);
  if (!apply)
    return { ...report, apply: false, inserted: 0, indexCreated: false };
  if (report.conflicts.length)
    throw Error(
      "Catalog conflicts require review before apply. No changes made.",
    );
  let indexCreated = false,
    inserted = 0;
  if (!indexes.some((i) => slugIndex(i) && i.unique)) {
    await collection.createIndex({ slug: 1 }, { name: "slug_1", unique: true });
    indexCreated = true;
  }
  for (const category of report.missing) {
    try {
      const result = await collection.updateOne(
        { slug: category.slug },
        {
          $setOnInsert: {
            ...category,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      inserted += result.upsertedCount || 0;
    } catch (e) {
      if (e.code !== 11000) throw e;
      // Another reconciliation won the unique-slug upsert; do not change its record.
      if (!(await collection.findOne({ slug: category.slug }))) throw e;
    }
  }
  return { ...report, apply: true, inserted, indexCreated };
}
export async function catalogDiagnostics(db) {
  const categories = await db.collection("categories").find({}).toArray();
  const people = await db
    .collection("users")
    .find(
      { role: "provider" },
      {
        projection: {
          status: 1,
          city: 1,
          "profile.status": 1,
          "profile.available": 1,
          "profile.city": 1,
          "profile.category": 1,
          "profile.categories": 1,
        },
      },
    )
    .toArray();
  const enabled = new Set(
    categories.filter((c) => c.enabled === true).map((c) => c.slug),
  );
  const { canonicalCity } = await import("../../shared/cities.js");
  const reasons = {
    providers: people.length,
    inactiveOrSuspended: 0,
    notApproved: 0,
    unavailable: 0,
    noEnabledCategory: 0,
    unsupportedCity: 0,
    discoverableAhmedabad: 0,
    cityMismatch: 0,
  };
  for (const p of people) {
    if (p.status !== "ACTIVE") reasons.inactiveOrSuspended++;
    else if (p.profile?.status !== "APPROVED") reasons.notApproved++;
    else if (p.profile.available !== true) reasons.unavailable++;
    else if (
      ![
        p.profile.category,
        ...(Array.isArray(p.profile.categories) ? p.profile.categories : []),
      ].some((slug) => enabled.has(slug))
    )
      reasons.noEnabledCategory++;
    else if (!canonicalCity(p.profile.city)) reasons.unsupportedCity++;
    else if (canonicalCity(p.profile.city) === "Ahmedabad")
      reasons.discoverableAhmedabad++;
    if (p.city && canonicalCity(p.city) !== canonicalCity(p.profile?.city))
      reasons.cityMismatch++;
  }
  return {
    database: db.databaseName,
    categoryCount: categories.length,
    enabledCount: enabled.size,
    providerReasons: reasons,
  };
}
