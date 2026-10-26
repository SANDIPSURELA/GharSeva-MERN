import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentMigrationOptions as options } from "../src/payment-migration-target.js";
import {
  inspectPaymentIndexes,
  migratePaymentIndexes,
  requirePaymentIndexes,
} from "../src/payment-indexes.js";
const copy = (v) => structuredClone(v);
const original = {
  _id: "historical",
  booking: "booking",
  customer: "customer",
  provider: "professional",
  amount: 9900,
  currency: "INR",
  receipt: "kept",
  paymentId: "pay_kept",
  capturedAmount: 9900,
  history: [{ action: "CAPTURED" }],
  billSnapshot: { total: 34900 },
};
const primary = { name: "_id_", key: { _id: 1 }, unique: true };
const legacy = { name: "booking_1", key: { booking: 1 }, unique: true };
const compound = {
  name: "payment_booking_purpose",
  key: { booking: 1, purpose: 1 },
  unique: true,
};
function fixture(
  rows = [original],
  indexes = [
    primary,
    legacy,
    { name: "receipt_1", key: { receipt: 1 }, unique: true },
  ],
) {
  const state = { rows: copy(rows), indexes: copy(indexes), writes: [] };
  const collection = {
    dbName: "disposable_review",
    collectionName: "payments",
    indexes: async () => copy(state.indexes),
    find: () => ({ toArray: async () => copy(state.rows) }),
    updateMany: async () => {
      state.writes.push("backfill");
      for (const p of state.rows)
        if (p.purpose == null) p.purpose = "VISIT_DEPOSIT";
    },
    createIndex: async (key, definition) => {
      state.writes.push("create");
      state.indexes.push({ key, ...definition });
    },
    dropIndex: async (name) => {
      state.writes.push("drop:" + name);
      state.indexes = state.indexes.filter((i) => i.name !== name);
    },
  };
  return {
    state,
    collection,
    apply: () =>
      migratePaymentIndexes(collection, {
        apply: true,
        confirmedDatabase: "disposable_review",
      }),
  };
}
test("migration accepts Atlas and replica-set URIs with explicit targets without connecting", () => {
  for (const uri of [
    "mongodb+srv://owner:encoded%40password@cluster.example/disposable_review?retryWrites=true&w=majority",
    "mongodb://one.example:27017,two.example:27017/disposable_review?replicaSet=rs0&authSource=admin",
    "mongodb://[::1]:27017/disposable_review",
  ]) {
    assert.equal(options(["--dry-run"], uri).database, "disposable_review");
    assert.equal(
      options(["--apply", "--confirm-db=disposable_review"], uri).apply,
      true,
    );
  }
});
test("missing or incorrect target confirmation and implicit databases are refused before connecting", () => {
  const uri = "mongodb://127.0.0.1/disposable_review";
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-db=other"],
    ["--apply", "--dry-run"],
    ["--apply", "--apply"],
    ["--dry-run", "--confirm-db=disposable_review"],
    ["--force"],
  ])
    assert.throws(() => options(args, uri));
  for (const uri of [
    undefined,
    "mongodb://127.0.0.1",
    "mongodb://127.0.0.1/?authSource=admin",
    "mongodb://127.0.0.1/admin",
    "invalid://secret@host/db",
  ])
    assert.throws(() => options([], uri));
});
test("library apply also refuses missing/wrong connected database confirmation before any reads or writes", async () => {
  const { collection, state } = fixture();
  for (const confirmedDatabase of [undefined, "other"])
    await assert.rejects(
      () =>
        migratePaymentIndexes(collection, { apply: true, confirmedDatabase }),
      /confirmation/,
    );
  assert.deepEqual(state.writes, []);
});
test("dry-run preserves records AND indexes; guarded apply backfills only purpose, is idempotent and preserves all history", async () => {
  const { collection, state, apply } = fixture(),
    before = copy(state);
  const report = await migratePaymentIndexes(collection);
  assert.equal(report.backfill, 1);
  assert.deepEqual(state, before);
  await apply();
  assert.deepEqual(state.rows, [{ ...original, purpose: "VISIT_DEPOSIT" }]);
  assert.deepEqual(state.writes, ["backfill", "create", "drop:booking_1"]);
  assert.ok(state.indexes.some((i) => i.name === "receipt_1"));
  assert.equal((await inspectPaymentIndexes(collection)).ready, true);
  state.writes = [];
  await apply();
  assert.deepEqual(state.writes, []);
});
test("all invalid/duplicate records are refused before any data/index change", async () => {
  for (const rows of [
    [original, { ...original, _id: "duplicate" }],
    [{ ...original, purpose: "UNRECOGNISED" }],
    [{ ...original, amount: 1.5 }],
    [{ ...original, amount: 0 }],
    [{ ...original, currency: "USD" }],
    [{ ...original, booking: null }],
  ]) {
    const { collection, state, apply } = fixture(rows),
      before = copy(state);
    await assert.rejects(apply, /Precheck/);
    assert.deepEqual(state, before);
  }
});
test("partial, sparse, hidden, nonunique, reverse and conflicting compound indexes require review", async () => {
  for (const index of [
    { ...compound, sparse: true },
    { ...compound, partialFilterExpression: { purpose: { $exists: true } } },
    { ...compound, hidden: true },
    { ...compound, unique: false },
    { ...compound, key: { purpose: 1, booking: 1 } },
    { ...compound, collation: { locale: "en" } },
    { ...compound, key: { customer: 1, purpose: 1 } },
  ]) {
    const { collection, state, apply } = fixture(
        [original],
        [primary, legacy, index],
      ),
      before = copy(state);
    await assert.rejects(apply, /review/);
    assert.deepEqual(state, before);
    await assert.rejects(
      () => requirePaymentIndexes(collection),
      (e) => e.status === 503,
    );
  }
});
test("unexpected legacy index name, sparse/partial/nonunique definitions are preserved and refused", async () => {
  for (const index of [
    { ...legacy, name: "custom_booking" },
    { ...legacy, sparse: true },
    { ...legacy, partialFilterExpression: { booking: { $exists: true } } },
    { ...legacy, unique: false },
    { ...legacy, key: { customer: 1 } },
  ]) {
    const { collection, state, apply } = fixture([original], [primary, index]),
      before = copy(state);
    await assert.rejects(apply, /review/);
    assert.deepEqual(state, before);
  }
});
test("an existing complete compound index with a different name is reused safely", async () => {
  const { collection, state, apply } = fixture(
    [original],
    [primary, legacy, { ...compound, name: "approved_existing" }],
  );
  await apply();
  assert.deepEqual(state.writes, ["backfill", "drop:booking_1"]);
  assert.equal((await inspectPaymentIndexes(collection)).ready, true);
});
test("failed or unverified replacement creation never drops legacy protection", async () => {
  const { collection, state, apply } = fixture();
  collection.createIndex = async () => {
    throw Error("index build refused");
  };
  await assert.rejects(apply, /refused/);
  assert.ok(state.indexes.some((i) => i.name === "booking_1"));
  collection.createIndex = async () => {};
  await assert.rejects(apply, /not verified/);
  assert.ok(state.indexes.some((i) => i.name === "booking_1"));
});

test("CLI refuses missing/wrong confirmation before attempting any database connection", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-db=wrong_database"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/migrate-payment-stages.js", import.meta.url),
        ),
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          MONGODB_URI: "mongodb://127.0.0.1:1/disposable_review",
        },
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No connection or write was attempted/);
    assert.ok(!result.stderr.includes("ECONNREFUSED"));
  }
});
