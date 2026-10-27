// Actual disposable MongoDB integration. A startup/connect failure stays a failed test; no saved URI fallback.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  createIsolatedMongo,
  connectIsolatedMongo,
} from "../../scripts/isolated-mongo.js";
import { reconcileCatalog } from "../src/catalog-reconciliation.js";
import { canonicalCatalog } from "../src/canonical-catalog.js";
import { expandDemo } from "../src/demo-expansion.js";
import { publicProviders } from "../src/app.js";
import { User, Category, File } from "../src/models.js";
let db;
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUTH_DELIVERY_MODE: "test",
    GHARSEVA_DEMO: "true",
  });
  db = await createIsolatedMongo();
  await connectIsolatedMongo(db);
  await Promise.all([User.init(), Category.init(), File.init()]);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
test("real isolated catalog dry-run, guarded apply and repeat expansion preserve existing disabled data and booking references", async () => {
  const persistent = await User.create({
    name: "Existing fixture administrator",
    email: "existing-admin@example.test",
    mobile: "9999999981",
    passwordHash: "unchanged-fixture-hash",
    role: "admin",
    city: "Pune",
  });
  const c = await Category.create({
    ...canonicalCatalog[0],
    enabled: false,
    name: "Owner plumbing label",
    price: 645,
  });
  const database = mongoose.connection.db,
    collection = database.collection("categories");
  const bookings = database.collection("bookings");
  await bookings.insertOne({
    category: c.slug,
    provider: persistent._id,
    status: "COMPLETED",
    receipt: "fixture-historical-receipt",
  });
  const before = {
    categories: await collection.find({}).toArray(),
    users: await database.collection("users").find({}).toArray(),
    bookings: await bookings.find({}).toArray(),
    indexes: await collection.indexes(),
  };
  const dry = await reconcileCatalog(collection);
  assert.equal(dry.missing.length, 9);
  assert.equal(dry.existingDisabled.length, 1);
  assert.deepEqual(await collection.find({}).toArray(), before.categories);
  assert.deepEqual(await collection.indexes(), before.indexes);
  await assert.rejects(() =>
    reconcileCatalog(collection, { apply: true, confirmedDatabase: "wrong" }),
  );
  const result = await reconcileCatalog(collection, {
    apply: true,
    confirmedDatabase: database.databaseName,
  });
  assert.equal(result.inserted, 9);
  assert.deepEqual(
    await collection.findOne({ _id: c._id }),
    before.categories[0],
  );
  assert.deepEqual(
    await database.collection("users").find({}).toArray(),
    before.users,
  );
  assert.deepEqual(await bookings.find({}).toArray(), before.bookings);
  const report = await expandDemo({
    apply: true,
    testOnlyContacts: true,
    passwords: {
      customer: "FixtureCustomer7!",
      provider: "FixtureProvider7!",
      admin: "FixtureAdmin7!",
    },
  });
  assert.equal(report.filter((r) => r.created).length, 34);
  const people = await publicProviders({
    "profile.city": "Ahmedabad",
    "profile.available": true,
  });
  assert.equal(
    people.length,
    18,
    "disabled plumbing stays hidden; other nine categories have two profiles each",
  );
  const userSnapshot = await database.collection("users").find({}).toArray();
  assert.equal(
    (
      await reconcileCatalog(collection, {
        apply: true,
        confirmedDatabase: database.databaseName,
      })
    ).inserted,
    0,
  );
  await expandDemo({ apply: true, testOnlyContacts: true });
  assert.deepEqual(
    await database.collection("users").find({}).toArray(),
    userSnapshot,
  );
  assert.deepEqual(await bookings.find({}).toArray(), before.bookings);
});
