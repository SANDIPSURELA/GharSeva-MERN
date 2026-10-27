import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  reconcileCatalog,
  inspectCatalog,
  catalogDiagnostics,
} from "../src/catalog-reconciliation.js";
import { canonicalCatalog } from "../src/canonical-catalog.js";
import { paymentMigrationOptions } from "../src/payment-migration-target.js";
import { demoExpansionTarget } from "../src/demo-target.js";
import { ahmedabadProviders } from "../../seed-data/demo-accounts.js";
import { demoIllustrations } from "../../seed-data/demo-work-images.js";
import {
  discoveryState,
  popularCategories,
} from "../../shared/discovery-state.js";
const copy = (v) => structuredClone(v),
  env = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
});
const unique = { name: "slug_1", key: { slug: 1 }, unique: true };
function fixture(rows = [], indexes = [unique]) {
  const state = { rows: copy(rows), indexes: copy(indexes), writes: [] };
  const collection = {
    dbName: "gharseva_test_catalog",
    collectionName: "categories",
    indexes: async () => copy(state.indexes),
    find: () => ({ toArray: async () => copy(state.rows) }),
    findOne: async ({ slug }) => copy(state.rows.find((r) => r.slug === slug)),
    createIndex: async (key, definition) => {
      state.writes.push("index");
      state.indexes.push({ key, ...definition });
    },
    updateOne: async ({ slug }, update) => {
      if (state.rows.some((r) => r.slug === slug)) return { upsertedCount: 0 };
      state.writes.push(slug);
      state.rows.push({
        _id: "inserted-" + slug,
        ...copy(update.$setOnInsert),
      });
      return { upsertedCount: 1 };
    },
  };
  return {
    state,
    collection,
    apply: (confirmedDatabase = "gharseva_test_catalog") =>
      reconcileCatalog(collection, { apply: true, confirmedDatabase }),
  };
}
test("catalog dry run writes neither records nor indexes and separates missing, disabled and conflicting categories", async () => {
  const disabled = {
    _id: "preserve",
    ...canonicalCatalog[0],
    enabled: false,
    price: 845,
    name: "Operator plumbing name",
  };
  const f = fixture([disabled], []);
  const before = copy(f.state);
  const r = await reconcileCatalog(f.collection);
  assert.equal(r.missing.length, 9);
  assert.equal(r.existingDisabled[0].id, "preserve");
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(f.state, before);
});
test("catalog apply adds missing canonical records while preserving IDs, prices, names and disabled choices; repeat is idempotent", async () => {
  const existing = {
    _id: "kept-id",
    ...canonicalCatalog[0],
    enabled: false,
    price: 645,
    name: "Owner label",
    description: "Owner text",
  };
  const f = fixture([existing], []),
    r = await f.apply();
  assert.equal(r.inserted, 9);
  assert.equal(r.indexCreated, true);
  assert.deepEqual(f.state.rows[0], existing);
  const snapshot = copy(f.state),
    again = await f.apply();
  assert.equal(again.inserted, 0);
  assert.equal(again.indexCreated, false);
  assert.deepEqual(f.state, snapshot);
});
test("catalog apply requires exact connected database confirmation before reads or writes", async () => {
  const f = fixture();
  for (const confirmation of [undefined, "", "different"]) {
    await assert.rejects(
      () =>
        reconcileCatalog(f.collection, {
          apply: true,
          confirmedDatabase: confirmation,
        }),
      /exact/,
    );
    assert.equal(f.state.writes.length, 0);
  }
});
test("normalized/duplicate slugs, conflicting names and malformed records refuse apply before writes", async () => {
  for (const rows of [
    [
      { _id: "a", ...canonicalCatalog[0] },
      { _id: "b", ...canonicalCatalog[0] },
    ],
    [{ ...canonicalCatalog[0], slug: " Plumbing " }],
    [{ ...canonicalCatalog[0], slug: "pipework" }],
    [{ ...canonicalCatalog[0], enabled: undefined }],
    [{ ...canonicalCatalog[0], price: -1 }],
    [{ ...canonicalCatalog[0], name: 42 }],
  ]) {
    const f = fixture(rows);
    assert.ok((await reconcileCatalog(f.collection)).conflicts.length);
    await assert.rejects(() => f.apply(), /conflicts/);
    assert.deepEqual(f.state.writes, []);
  }
});
test("custom, partial and sparse conflicting indexes require review without dropping or rewriting indexes", async () => {
  for (const index of [
    { ...unique, unique: false },
    { ...unique, sparse: true },
    { ...unique, partialFilterExpression: { enabled: true } },
    { ...unique, collation: { locale: "en", strength: 2 } },
    { name: "slug_1", key: { name: 1 }, unique: true },
  ]) {
    const f = fixture([], [index]);
    assert.ok(inspectCatalog([], [index]).conflicts.length);
    await assert.rejects(() => f.apply(), /conflicts/);
    assert.deepEqual(f.state.indexes, [index]);
    assert.deepEqual(f.state.writes, []);
  }
});
test("concurrent canonical upserts rely on unique slug ownership without modifying a competing record", async () => {
  const f = fixture([], [unique]);
  const results = await Promise.all([f.apply(), f.apply()]);
  assert.equal(f.state.rows.length, 10);
  assert.equal(new Set(f.state.rows.map((r) => r.slug)).size, 10);
  assert.equal(
    results.reduce((n, r) => n + r.inserted, 0),
    10,
  );
});
test("operator targets accept explicit Atlas/replica-set databases and reject confirmation errors without connecting or leaking credentials", () => {
  for (const uri of [
    "mongodb+srv://owner:private-secret@cluster.example/gharseva",
    "mongodb://one.example:27017,two.example:27017/gharseva?replicaSet=rs0",
    "mongodb://127.0.0.1:27017/gharseva",
  ]) {
    assert.equal(paymentMigrationOptions([], uri).database, "gharseva");
    assert.equal(
      paymentMigrationOptions(["--apply", "--confirm-db=gharseva"], uri).apply,
      true,
    );
    assert.throws(
      () => paymentMigrationOptions(["--apply", "--confirm-db=wrong"], uri),
      (e) => !e.message.includes("private-secret"),
    );
  }
  for (const uri of ["mongodb://127.0.0.1", "mongodb://127.0.0.1/admin", "bad"])
    assert.throws(() => paymentMigrationOptions([], uri));
});
test("demo writes refuse hosted/shared targets and non-classroom modes even when a database is confirmed", () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    GHARSEVA_DEMO: "true",
    AUTH_DELIVERY_MODE: "test",
  });
  const check = (uri, name) =>
    demoExpansionTarget(["--apply", "--confirm-db=" + name], uri);
  assert.equal(
    check(
      "mongodb://127.0.0.1:27017/gharseva_demo_local",
      "gharseva_demo_local",
    ).apply,
    true,
  );
  for (const [uri, name] of [
    [
      "mongodb+srv://cluster.example/gharseva_demo_local",
      "gharseva_demo_local",
    ],
    ["mongodb://remote.example/gharseva_test_local", "gharseva_test_local"],
    ["mongodb://127.0.0.1/shared", "shared"],
  ])
    assert.throws(() => check(uri, name), /isolated/);
  process.env.AUTH_DELIVERY_MODE = "live";
  assert.throws(
    () =>
      check("mongodb://127.0.0.1/gharseva_demo_local", "gharseva_demo_local"),
    /non-production/,
  );
});
test("catalog diagnostic counts distinguish existing blocked providers and disclose no private accounts/documents", async () => {
  const categories = [
    { ...canonicalCatalog[0] },
    { ...canonicalCatalog[1], enabled: false },
  ];
  const approved = {
    role: "provider",
    status: "ACTIVE",
    city: "Ahmedabad",
    profile: {
      status: "APPROVED",
      available: true,
      city: " AHEMDABAD ",
      category: "plumbing",
    },
  };
  const users = [
    approved,
    { ...approved, status: "SUSPENDED" },
    { ...approved, profile: { ...approved.profile, status: "PENDING" } },
    { ...approved, profile: { ...approved.profile, available: false } },
    { ...approved, profile: { ...approved.profile, category: "electrical" } },
  ];
  const db = {
    databaseName: "gharseva_test_catalog",
    collection: (name) => ({
      find: () => ({
        toArray: async () => copy(name === "categories" ? categories : users),
      }),
    }),
  };
  const r = await catalogDiagnostics(db);
  assert.equal(r.categoryCount, 2);
  assert.equal(r.enabledCount, 1);
  for (const key of [
    "inactiveOrSuspended",
    "notApproved",
    "unavailable",
    "noEnabledCategory",
    "discoverableAhmedabad",
  ])
    assert.equal(r.providerReasons[key], 1);
  assert.equal(r.providerReasons.cityMismatch, 0);
  assert.equal(r.email, undefined);
});
test("twenty Ahmedabad demo profiles have stable, distinct local service diagrams labelled as illustrations", async () => {
  const hashes = new Set();
  assert.equal(ahmedabadProviders.length, 20);
  for (const p of ahmedabadProviders) {
    const photo = demoIllustrations[p.id];
    const bytes = readFileSync(
      new URL("../../client/public" + photo.src, import.meta.url),
    );
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    const size = await sharp(bytes).metadata();
    assert.equal(size.width, 800);
    assert.equal(size.height, 500);
    assert.equal(photo.kind, "illustration");
    assert.match(bytes.toString(), /DEMO SERVICE ILLUSTRATION/);
    assert.ok(bytes.toString().includes(p.name));
  }
  assert.equal(hashes.size, 20);
});
test("public UI policy distinguishes loading, errors, disabled catalog, city selection, empty city and filter misses", () => {
  const base = {
    categories: canonicalCatalog,
    providers: [{}],
    city: "Ahmedabad",
  };
  assert.equal(discoveryState({ ...base, loading: true }), "loading");
  assert.equal(discoveryState({ ...base, error: "failed" }), "error");
  assert.equal(discoveryState({ ...base, categories: [] }), "empty-catalog");
  assert.equal(discoveryState({ ...base, city: "" }), "select-city");
  assert.equal(discoveryState({ ...base, providers: [] }), "empty-city");
  assert.equal(discoveryState({ ...base, resultCount: 0 }), "no-results");
  assert.equal(discoveryState(base), "ready");
});

test("homepage service chips use enabled catalog labels and fall back when preferred categories are disabled", () => {
  assert.deepEqual(popularCategories([]), []);
  const category = {
    slug: "gardening",
    name: "Owner garden label",
    enabled: true,
  };
  assert.deepEqual(
    popularCategories([{ slug: "plumbing", enabled: false }, category]),
    [category],
  );
  assert.equal(popularCategories(canonicalCatalog).length, 3);
});
