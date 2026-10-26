import { fail } from "./domain.js";
import { requireConfirmedPaymentDatabase } from "./payment-migration-target.js";
const isLegacyKey = (i) =>
  Object.keys(i.key || {}).length === 1 && i.key.booking === 1;
const isCompoundKey = (i) =>
  Object.keys(i.key || {}).join(",") === "booking,purpose" &&
  i.key.booking === 1 &&
  i.key.purpose === 1;
const custom = (i) =>
  i.sparse ||
  i.partialFilterExpression ||
  i.collation ||
  i.hidden ||
  i.expireAfterSeconds !== undefined ||
  i.prepareUnique;
function reviewedIndexes(indexes) {
  for (const i of indexes) {
    if (
      i.name === "payment_booking_purpose" ||
      (Object.keys(i.key || {}).length === 2 &&
        "booking" in i.key &&
        "purpose" in i.key)
    ) {
      if (!isCompoundKey(i) || i.unique !== true || custom(i))
        throw Error(
          "Conflicting, partial, sparse or custom payment index definition; manual review required before changes.",
        );
    }
    if ((isLegacyKey(i) && i.unique) || i.name === "booking_1") {
      if (
        !isLegacyKey(i) ||
        i.unique !== true ||
        i.name !== "booking_1" ||
        custom(i)
      )
        throw Error(
          "Unexpected legacy booking index definition; manual review required before changes.",
        );
    }
  }
}
export async function inspectPaymentIndexes(collection) {
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (e) {
    if (e.code === 26) return { ready: false, legacy: false, indexes: [] };
    throw e;
  }
  reviewedIndexes(indexes);
  const legacy = indexes.some((i) => i.unique && isLegacyKey(i));
  const compound = indexes.some((i) => i.unique && isCompoundKey(i));
  return { ready: compound && !legacy, legacy, indexes };
}
export async function requirePaymentIndexes(collection) {
  let ready = false;
  try {
    ready = (await inspectPaymentIndexes(collection)).ready;
  } catch {
    /* Explicit setup state; never collect on an unreviewed index. */
  }
  if (!ready)
    fail(
      503,
      "Payment index upgrade/review required. Run the documented dry-run and guarded apply command before balance collection.",
    );
}
export async function migratePaymentIndexes(
  collection,
  { apply = false, confirmedDatabase } = {},
) {
  if (apply)
    requireConfirmedPaymentDatabase(collection.dbName, confirmedDatabase);
  const index = await inspectPaymentIndexes(collection),
    rows = await collection.find({}).toArray(),
    seen = new Set();
  let backfill = 0;
  for (const p of rows) {
    const purpose = p.purpose ?? "VISIT_DEPOSIT",
      key = String(p.booking) + ":" + purpose;
    if (
      !p.booking ||
      !["VISIT_DEPOSIT", "FINAL_BALANCE"].includes(purpose) ||
      seen.has(key) ||
      !Number.isSafeInteger(p.amount) ||
      p.amount < 1 ||
      p.currency !== "INR"
    )
      throw Error(
        "Precheck failed: invalid/duplicate booking-purpose or monetary data. No records or indexes changed.",
      );
    seen.add(key);
    if (p.purpose == null) backfill++;
  }
  const legacy = index.indexes.filter((i) => i.unique && isLegacyKey(i));
  const compound = index.indexes.find((i) => i.unique && isCompoundKey(i));
  const report = {
    collection: collection.collectionName,
    records: rows.length,
    backfill,
    dropOnly: legacy.map((i) => i.name),
    create: compound?.name || "payment_booking_purpose",
    apply,
    ready: index.ready,
  };
  if (!apply) return report;
  if (backfill)
    await collection.updateMany(
      { $or: [{ purpose: { $exists: false } }, { purpose: null }] },
      { $set: { purpose: "VISIT_DEPOSIT" } },
    );
  if (!compound)
    await collection.createIndex(
      { booking: 1, purpose: 1 },
      { unique: true, name: "payment_booking_purpose" },
    );
  // Never remove the old constraint until the complete replacement is verified.
  const verified = await inspectPaymentIndexes(collection);
  if (!verified.indexes.some((i) => i.unique && isCompoundKey(i)))
    throw Error("Replacement index was not verified; legacy index retained.");
  for (const old of legacy) await collection.dropIndex(old.name);
  report.ready = (await inspectPaymentIndexes(collection)).ready;
  return report;
}
