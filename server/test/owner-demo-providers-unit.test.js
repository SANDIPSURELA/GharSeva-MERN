import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  demoDefinitions,
  planDemoProviders,
  makePendingProvider,
  newUniquePassword,
  summary,
} from "../src/owner-demo-providers.js";
import { User } from "../src/models.js";
import {
  writePending,
  readPending,
  finishCredential,
  prepareDirectory,
} from "../../scripts/owner-demo-journal.js";
const baseEmail = "owner123@example.invalid".replace(
    "@example.invalid",
    "@gmail.com",
  ),
  db = "fixture_database";
const categories = [...new Set(demoDefinitions.map((p) => p.serviceId))].map(
  (slug) => ({ slug, enabled: true }),
);
const store = [];
const findMatches = async (q) =>
  store.filter(
    (u) =>
      String(u._id) === q.id ||
      u.email === q.email ||
      u.mobile === q.mobile ||
      u.demoAccountId === "owner-demo:" + q.marker ||
      u.profile?.demoProviderId === q.marker,
  );
const plan = () =>
  planDemoProviders({ database: db, baseEmail, categories, findMatches });
test("dry run plans twenty fictional accounts with no writes and idempotent repeat preserves stored records", async () => {
  store.length = 0;
  const before = JSON.stringify(store),
    rows = await plan();
  assert.equal(JSON.stringify(store), before);
  assert.equal(rows.length, 20);
  assert.equal(summary(rows).insert, 20);
  const created = await makePendingProvider(rows[0], newUniquePassword());
  store.push({
    ...created,
    profile: {
      ...created.profile,
      status: "REJECTED",
      documents: ["existing"],
    },
    other: { bookings: ["keep"], password: "unchanged" },
  });
  const snapshot = JSON.stringify(store);
  const repeated = await plan();
  assert.equal(repeated[0].action, "skip");
  assert.equal(summary(repeated).insert, 19);
  assert.equal(JSON.stringify(store), snapshot);
});
test("real-account collisions and disabled or missing categories never become insertions", async () => {
  store.length = 0;
  const rows = await plan();
  store.push({
    _id: "c".repeat(24),
    email: rows[0].email,
    role: "customer",
    profile: { status: "APPROVED" },
  });
  const disabled = categories
    .map((c) => ({ ...c, enabled: c.slug !== "electrical" }))
    .filter((c) => c.slug !== "cooking");
  const next = await planDemoProviders({
    database: db,
    baseEmail,
    categories: disabled,
    findMatches,
  });
  assert.equal(next[0].action, "conflict");
  assert.equal(
    next.filter((x) => x.action === "category_unavailable").length,
    4,
  );
  assert.equal(store[0].role, "customer");
});
test("new users use unique strong bcrypt hashes, pending identity review and no fabricated verification", async () => {
  store.length = 0;
  const rows = await plan();
  const a = newUniquePassword(),
    b = newUniquePassword();
  assert.ok(a !== b);
  const first = await makePendingProvider(rows[0], a),
    second = await makePendingProvider(rows[1], b);
  assert.equal(await bcrypt.compare(a, first.passwordHash), true);
  assert.equal(await bcrypt.compare(b, first.passwordHash), false);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(first.profile.status, "PENDING");
  assert.equal(first.profile.identityRequired, true);
  assert.deepEqual(first.profile.documents, []);
  assert.equal(first.verification, undefined);
  assert.match(first.name, /DEMO \/ Fictional professional/);
  assert.equal(first.profile.experience, 0);
  const validated = new User(first);
  await validated.validate();
});
test("private journal recovers after creation and never truncates earlier credential entries", async () => {
  const parent = await fs.mkdtemp(
    path.join(process.cwd(), ".test-tmp", "gharseva-private-test-"),
  );
  const repo = path.join(parent, "repo"),
    dir = path.join(parent, "private");
  await fs.mkdir(repo);
  await prepareDirectory(dir, repo);
  const make = (n) => ({
    id: String(n).repeat(24),
    database: db,
    marker: "fixture-" + n,
    number: n,
    name: "Fictional",
    category: "plumbing",
    email: "fixture" + n + "@example.test",
    password: newUniquePassword(),
  });
  const first = make(1),
    second = {
      ...make(2),
      email: "project2026-ahm-plumbing-1@yopmail.com",
      emailMode: "yopmail",
    };
  await writePending(dir, first);
  assert.equal((await readPending(dir)).id, first.id);
  await finishCredential(dir, first);
  await writePending(dir, second);
  const before = await fs.readFile(
    path.join(dir, "demo-provider-accounts.txt"),
    "utf8",
  );
  assert.ok(before.includes(first.marker));
  assert.ok(!before.includes(second.marker));
  await finishCredential(dir, second);
  const after = await fs.readFile(
    path.join(dir, "demo-provider-accounts.txt"),
    "utf8",
  );
  assert.ok(after.includes(first.marker));
  assert.ok(after.includes(second.marker));
  const link = after
    .split("\n")
    .find((line) => line.startsWith("Public YOPmail inbox:"));
  assert.equal(
    link,
    "Public YOPmail inbox: https://yopmail.com/?project2026-ahm-plumbing-1",
  );
  assert.ok(!link.includes(second.password));
  await writePending(dir, second);
  await finishCredential(dir, second);
  assert.equal(
    (
      await fs.readFile(path.join(dir, "demo-provider-accounts.txt"), "utf8")
    ).split("Demo ID: " + second.marker).length - 1,
    1,
  );
  assert.equal(await readPending(dir), null);
  const third = make(3);
  await writePending(dir, third);
  await fs.appendFile(
    path.join(dir, "demo-provider-accounts.txt"),
    "\nDemo ID: " + third.marker + " | Database: " + db + "\n",
  );
  await assert.rejects(() => finishCredential(dir, third), /incomplete/);
  assert.equal((await readPending(dir)).id, third.id);
  for (const name of await fs.readdir(dir))
    await fs.unlink(path.join(dir, name));
  await fs.rmdir(dir);
  await fs.rmdir(repo);
  await fs.rmdir(parent);
});
test("repository cannot be used as the credential directory", async () => {
  await assert.rejects(
    () => prepareDirectory(process.cwd(), process.cwd()),
    /outside/,
  );
});

test("YOPmail plans are unique, stable, valid and produce safe inbox links", async () => {
  const { yopmailDemoAddresses, yopmailInboxLink } =
    await import("../../shared/demo-email-aliases.js");
  const ids = demoDefinitions.map((p) => p.id);
  const one = yopmailDemoAddresses("gharseva2026", ids),
    two = yopmailDemoAddresses("gharseva2026", ids);
  assert.deepEqual(one, two);
  assert.equal(new Set(one).size, 20);
  for (const address of one) {
    assert.match(address, /^[a-z0-9-]+@yopmail\.com$/);
    assert.equal(
      yopmailInboxLink(address),
      "https://yopmail.com/?" + encodeURIComponent(address.split("@")[0]),
    );
  }
  for (const bad of [
    "",
    "x",
    "AProject",
    "test@example.com",
    "prefix/evil",
    "prefix?x=1",
    "x".repeat(25),
  ])
    assert.throws(() => yopmailDemoAddresses(bad, ids));
  assert.throws(() => yopmailInboxLink("demo@example.com"));
});
test("Gmail and YOPmail plans use same stable IDs and reject changed mode or prefix for an existing account", async () => {
  store.length = 0;
  const gmail = await plan();
  const make = (prefix) =>
    planDemoProviders({
      database: db,
      emailMode: "yopmail",
      yopmailPrefix: prefix,
      categories,
      findMatches,
    });
  const demo = await make("project2026");
  assert.equal(demo.length, 20);
  assert.equal(demo[0].id, gmail[0].id);
  assert.notEqual(demo[0].email, gmail[0].email);
  const account = await makePendingProvider(demo[0], newUniquePassword());
  store.push(account);
  assert.equal((await make("project2026"))[0].action, "skip");
  assert.equal((await make("project2027"))[0].action, "conflict");
  assert.equal((await plan())[0].action, "conflict");
  store.length = 0;
});
test("pending recovery journals bind the database, stable ID, email and selected mode", async () => {
  const { pendingMatchesPlan } = await import("../src/owner-demo-providers.js");
  store.length = 0;
  const rows = await planDemoProviders({
    database: db,
    emailMode: "yopmail",
    yopmailPrefix: "project2026",
    categories,
    findMatches,
  });
  const pending = {
    database: db,
    id: rows[0].id,
    marker: rows[0].definition.id,
    email: rows[0].email,
    emailMode: "yopmail",
  };
  assert.equal(pendingMatchesPlan(pending, db, rows, "yopmail"), true);
  assert.equal(pendingMatchesPlan(pending, db, rows, "gmail"), false);
  const other = await planDemoProviders({
    database: db,
    emailMode: "yopmail",
    yopmailPrefix: "project2027",
    categories,
    findMatches,
  });
  assert.equal(pendingMatchesPlan(pending, db, other, "yopmail"), false);
  assert.equal(
    pendingMatchesPlan(
      { ...pending, emailMode: undefined },
      db,
      rows,
      "yopmail",
    ),
    true,
  );
  assert.equal(pendingMatchesPlan(pending, "otherdb", rows, "yopmail"), false);
});
