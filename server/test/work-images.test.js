import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import sharp from "sharp";
import { demoProviders } from "../../seed-data/demo-accounts.js";
import { demoWorkImages } from "../../seed-data/demo-work-images.js";
import {
  resolveWorkImages,
  publicWorkImageView,
  demoProviderFor,
  legacyDemoImage,
} from "../../shared/work-images.js";
import { createApp } from "../src/app.js";
import { User, File } from "../src/models.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fileA = new mongoose.Types.ObjectId(),
  fileB = new mongoose.Types.ObjectId();
const src = (id) => "/api/files/" + id;
const demoUser = (p, portfolio = [legacyDemoImage(p.serviceId)]) => ({
  _id: new mongoose.Types.ObjectId(),
  name: p.name,
  email: p.email,
  mobile: p.mobile,
  role: "provider",
  passwordHash: "unchanged-hash",
  status: "ACTIVE",
  profile: {
    category: p.serviceId,
    portfolio,
    photo: "/api/files/aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "APPROVED",
    price: p.price,
    documents: [new mongoose.Types.ObjectId()],
  },
});
afterEach(() => mock.restoreAll());

test("all twelve stable demo IDs have genuinely distinct local photo assets and sources", async () => {
  assert.equal(Object.keys(demoWorkImages).length, 12);
  const sources = new Set(),
    hashes = new Set();
  for (const p of demoProviders.filter((p) => demoWorkImages[p.id])) {
    const photo = demoWorkImages[p.id];
    assert.ok(photo && photo.description);
    assert.ok(!sources.has(photo.source), p.id + " source duplicated");
    sources.add(photo.source);
    const path = root + "client/public" + photo.src;
    assert.ok(existsSync(path), path);
    const bytes = readFileSync(path);
    const metadata = await sharp(bytes).metadata();
    assert.ok(
      metadata.width >= 500 && metadata.height >= 300,
      p.id + " insufficient dimensions",
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(!hashes.has(hash), p.id + " duplicate bytes");
    hashes.add(hash);
    const user = demoUser(p);
    const before = JSON.stringify(user);
    const view = publicWorkImageView(user, []);
    assert.equal(view.demoProviderId, p.id);
    assert.equal(view.workImages[0].src, photo.src);
    assert.equal(view.workImages[0].kind, "sample");
    assert.match(view.workImages[0].label, /Sample/);
    assert.match(view.workImages[0].alt, /not verified/);
    assert.equal(JSON.stringify(user), before, "legacy record mutated");
    assert.deepEqual(
      publicWorkImageView(user, []),
      view,
      "mapping not idempotent",
    );
    const newSeedUser = {
      ...user,
      profile: {
        ...user.profile,
        demoProviderId: p.id,
        portfolio: [photo.src],
      },
    };
    assert.equal(
      publicWorkImageView(newSeedUser, []).workImages[0].src,
      photo.src,
    );
  }
  assert.equal(hashes.size, 12);
});

test("same-category cleaners, cooks and electricians receive different stable samples", () => {
  for (const category of ["cleaning", "cooking", "electrical"]) {
    const people = demoProviders.filter(
      (p) => p.serviceId === category && demoWorkImages[p.id],
    );
    assert.equal(people.length, 2);
    const images = people.map(
      (p) => publicWorkImageView(demoUser(p), []).portfolio[0],
    );
    assert.notEqual(images[0], images[1]);
  }
});

test("real work uploads beat legacy/new samples and keep card, gallery and owner ordering consistent", () => {
  const user = demoUser(demoProviders[1], [
    "/images/cleaning.jpg",
    src(fileA),
    src(fileB),
  ]);
  const before = JSON.stringify(user);
  const files = [fileA, fileB].map((_id) => ({
    _id,
    owner: user._id,
    kind: "portfolio",
  }));
  const view = publicWorkImageView(user, files);
  assert.deepEqual(view.portfolio, [
    src(fileA),
    src(fileB),
    demoWorkImages["anita-sharma"].src,
  ]);
  assert.equal(view.workImages[0].kind, "upload");
  assert.match(view.workImages[0].alt, /uploaded by Anita Sharma/);
  assert.deepEqual(
    resolveWorkImages({ name: user.name, ...view }),
    resolveWorkImages(user),
  );
  assert.equal(JSON.stringify(user), before);
});

test("private documents, identity evidence, portraits and another provider's files never become public work", () => {
  const user = demoUser(demoProviders[0], [src(fileA), src(fileB)]);
  const files = [
    { _id: fileA, owner: user._id, kind: "document" },
    { _id: fileB, owner: user._id, kind: "identity" },
    { _id: fileB, owner: new mongoose.Types.ObjectId(), kind: "portfolio" },
  ];
  assert.deepEqual(publicWorkImageView(user, files).workImages, []);
  const real = {
    ...user,
    name: "Real Professional",
    email: "real@example.test",
    profile: {
      ...user.profile,
      demoProviderId: undefined,
      portfolio: [],
      photo: src(fileA),
    },
  };
  assert.deepEqual(publicWorkImageView(real, files).workImages, []);
  assert.deepEqual(resolveWorkImages(real), []);
});

test("legacy matching requires exact known account identity/category and never rewrites an unrelated record", () => {
  const known = demoUser(demoProviders[7]);
  for (const change of [
    { email: "other@example.com" },
    { mobile: "9999999999" },
    { name: "Another person" },
    { role: "customer" },
    { profile: { ...known.profile, category: "cooking" } },
  ]) {
    const other = { ...known, ...change };
    const snapshot = JSON.stringify(other);
    assert.equal(demoProviderFor(other), null);
    assert.deepEqual(publicWorkImageView(other, []).workImages, []);
    assert.equal(JSON.stringify(other), snapshot);
  }
});

function uploadRoute(app, method = "post") {
  return app.router.stack.find(
    (layer) =>
      layer.route?.path ===
        (method === "post" ? "/api/files" : "/api/files/:id") &&
      layer.route.methods[method],
  ).route;
}
function response() {
  return {
    statusCode: 200,
    data: null,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
}
const imageFile = () => ({
  originalname: "my-work.jpg",
  mimetype: "image/jpeg",
  buffer: readFileSync(root + "client/public/images/demo-work/farah-khan.jpg"),
});

test("actual upload handler prepends work, preserves genuine photos and unrelated fields, and deletion keeps older work", async () => {
  const p = demoProviders[7];
  const user = new User({
    ...demoUser(p, ["/images/cleaning.jpg", src(fileA)]),
    passwordHash: "existing-hash",
  });
  const fixed = {
    name: user.name,
    role: user.role,
    passwordHash: user.passwordHash,
    status: user.status,
    price: user.profile.price,
    approval: user.profile.status,
    portrait: user.profile.photo,
    documents: user.profile.documents.map(String),
  };
  const createdId = new mongoose.Types.ObjectId();
  let saves = 0,
    removed = 0;
  mock.method(user, "save", async () => {
    saves++;
    return user;
  });
  const record = {
    _id: createdId,
    kind: "portfolio",
    name: "my-work.jpg",
    owner: user._id,
    deleteOne: async () => {
      removed++;
    },
  };
  mock.method(File, "create", async (data) => {
    assert.equal(data.kind, "portfolio");
    assert.equal(String(data.owner), String(user._id));
    return record;
  });
  const app = createApp(),
    route = uploadRoute(app),
    res = response();
  await route.stack
    .at(-1)
    .handle({ body: { kind: "portfolio" }, user, file: imageFile() }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(
    [...user.profile.portfolio],
    [src(createdId), "/images/cleaning.jpg", src(fileA)],
  );
  const view = publicWorkImageView(user.toObject(), [
    record,
    { _id: fileA, owner: user._id, kind: "portfolio" },
  ]);
  assert.equal(view.portfolio[0], src(createdId));
  mock.method(File, "findOne", async (filter) => {
    assert.equal(String(filter.owner), String(user._id));
    return record;
  });
  const deleted = response();
  await uploadRoute(app, "delete")
    .stack.at(-1)
    .handle({ params: { id: String(createdId) }, user }, deleted);
  assert.equal(removed, 1);
  assert.equal(saves, 2);
  assert.deepEqual(
    [...user.profile.portfolio],
    ["/images/cleaning.jpg", src(fileA)],
  );
  assert.deepEqual(
    {
      name: user.name,
      role: user.role,
      passwordHash: user.passwordHash,
      status: user.status,
      price: user.profile.price,
      approval: user.profile.status,
      portrait: user.profile.photo,
      documents: user.profile.documents.map(String),
    },
    fixed,
  );
});

test("six-photo limit counts uploads only; provider-only upload guards remain in place", async () => {
  const user = new User({
    ...demoUser(demoProviders[0]),
    passwordHash: "existing-hash",
  });
  user.profile.portfolio = [
    "/images/plumbing.jpg",
    ...Array.from({ length: 6 }, () => src(new mongoose.Types.ObjectId())),
  ];
  const route = uploadRoute(createApp());
  const freshError = await new Promise((resolve) =>
    route.stack[0].handle({ headers: {} }, {}, resolve),
  );
  assert.equal(freshError.status, 401);
  const roleError = await new Promise((resolve) =>
    route.stack[1].handle({ user: { role: "customer" } }, {}, resolve),
  );
  assert.equal(roleError.status, 403);
  mock.method(File, "create", async () => {
    throw new Error("Must reject before storing");
  });
  await assert.rejects(
    () =>
      route.stack
        .at(-1)
        .handle(
          { body: { kind: "portfolio" }, user, file: imageFile() },
          response(),
        ),
    /six work photos/,
  );
});

test("upload failure removes only the new file and does not delete earlier photographs", async () => {
  const user = new User({
    ...demoUser(demoProviders[0], [src(fileA)]),
    passwordHash: "existing-hash",
  });
  const createdId = new mongoose.Types.ObjectId();
  let cleaned = 0;
  mock.method(File, "create", async () => ({
    _id: createdId,
    name: "my-work.jpg",
    deleteOne: async () => {
      cleaned++;
    },
  }));
  mock.method(user, "save", async () => {
    throw new Error("Save failed");
  });
  await assert.rejects(
    () =>
      uploadRoute(createApp())
        .stack.at(-1)
        .handle(
          { body: { kind: "portfolio" }, user, file: imageFile() },
          response(),
        ),
    /Save failed/,
  );
  assert.equal(cleaned, 1);
  assert.ok(user.profile.portfolio.includes(src(fileA)));
});

test("older public API demo fingerprints resolve without writes, while edited/real descriptions stay neutral", () => {
  const p = demoProviders[7];
  const legacy = {
    name: p.name,
    category: p.serviceId,
    area: p.location,
    city: p.city,
    bio: p.bio + " Sample professional profile for the college demonstration.",
    portfolio: [legacyDemoImage(p.serviceId)],
  };
  const frozen = Object.freeze({
    ...legacy,
    portfolio: Object.freeze([...legacy.portfolio]),
  });
  assert.equal(resolveWorkImages(frozen)[0].src, demoWorkImages[p.id].src);
  assert.deepEqual(resolveWorkImages({ ...legacy, bio: p.bio }), []);
  assert.deepEqual(
    resolveWorkImages({ ...legacy, area: "Another location" }),
    [],
  );
  assert.deepEqual(resolveWorkImages({ ...legacy, workImages: [] }), []);
  assert.deepEqual([...frozen.portfolio], [legacyDemoImage(p.serviceId)]);
});

test("empty-database seed configuration creates twelve stable, distinct work-photo assignments", async () => {
  const { seed } = await import("../src/seed.js");
  const { Category, Booking, Review, Settings } =
    await import("../src/models.js");
  const original = {};
  for (const key of [
    "SEED_CUSTOMER_PASSWORD",
    "SEED_PROVIDER_PASSWORD",
    "SEED_ADMIN_PASSWORD",
  ]) {
    original[key] = process.env[key];
    process.env[key] = "ExampleSeed123!";
  }
  const created = [];
  mock.method(User, "countDocuments", async () => 0);
  mock.method(User, "create", async (data) => {
    const row = {
      _id: new mongoose.Types.ObjectId(),
      ...data,
      save: async () => row,
    };
    created.push(row);
    return row;
  });
  mock.method(File, "create", async () => ({
    _id: new mongoose.Types.ObjectId(),
  }));
  mock.method(Category, "updateOne", async () => ({}));
  mock.method(Settings, "updateOne", async () => ({}));
  mock.method(Booking, "create", async () => ({
    _id: new mongoose.Types.ObjectId(),
  }));
  mock.method(Review, "create", async () => ({
    _id: new mongoose.Types.ObjectId(),
  }));
  try {
    await seed();
    const providers = created.filter((row) => row.role === "provider");
    assert.equal(providers.length, demoProviders.length);
    assert.equal(
      new Set(
        providers
          .filter((row) => row.profile.portfolio.length)
          .map((row) => row.profile.portfolio[0]),
      ).size,
      12,
    );
    for (const row of providers) {
      const p = demoProviders.find((p) => p.id === row.profile.demoProviderId);
      assert.ok(p);
      assert.equal(row.email, p.email);
      assert.deepEqual(
        row.profile.portfolio,
        demoWorkImages[p.id] ? [demoWorkImages[p.id].src] : [],
      );
      assert.equal(row.profile.price, p.price);
      assert.equal(row.profile.status, "APPROVED");
      assert.equal(row.profile.documents.length, 1);
    }
  } finally {
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});

test("seed still skips an existing database without modifying any existing record", async () => {
  const { seed } = await import("../src/seed.js");
  mock.method(User, "countDocuments", async () => 1);
  const create = mock.method(User, "create", async () => {
    throw new Error("Unexpected seed write");
  });
  const fileCreate = mock.method(File, "create", async () => {
    throw new Error("Unexpected file write");
  });
  await seed();
  assert.equal(create.mock.callCount(), 0);
  assert.equal(fileCreate.mock.callCount(), 0);
});

test("actual public provider handler normalises legacy samples, filters private/foreign files and performs no data writes", async () => {
  const { Category, Booking, Review } = await import("../src/models.js");
  const anita = demoUser(demoProviders[1], [
    "/images/cleaning.jpg",
    src(fileA),
    src(fileB),
  ]);
  const farah = demoUser(demoProviders[7]);
  const people = [anita, farah],
    snapshot = JSON.stringify(people);
  mock.method(Category, "find", () => ({
    lean: async () => [{ slug: "cleaning", name: "Home Cleaning" }],
  }));
  mock.method(User, "find", (filter) => {
    assert.equal(filter.role, "provider");
    assert.equal(filter.status, "ACTIVE");
    return { lean: async () => people };
  });
  mock.method(Review, "aggregate", async () => []);
  mock.method(Booking, "aggregate", async () => []);
  mock.method(File, "find", (filter) => {
    assert.equal(filter.kind, "portfolio");
    return {
      select: () => ({
        lean: async () => [
          { _id: fileA, owner: anita._id, kind: "portfolio" },
          { _id: fileB, owner: anita._id, kind: "document" },
          { _id: fileB, owner: farah._id, kind: "portfolio" },
        ],
      }),
    };
  });
  const writes = mock.method(User, "updateOne", async () => {
    throw new Error("Unexpected account write");
  });
  const app = createApp(),
    res = response();
  const route = app.router.stack.find(
    (layer) =>
      layer.route?.path === "/api/providers" && layer.route.methods.get,
  ).route;
  await route.stack.at(-1).handle({ query: { city: "Bengaluru" } }, res);
  assert.deepEqual(res.data[0].portfolio, [src(fileA), "/images/cleaning.jpg"]);
  assert.equal(res.data[1].portfolio[0], demoWorkImages["farah-khan"].src);
  assert.equal(res.data[0].documents, undefined);
  assert.equal(res.data[0].passwordHash, undefined);
  assert.equal(res.data[0].price, anita.profile.price);
  assert.equal(JSON.stringify(people), snapshot);
  assert.equal(writes.mock.callCount(), 0);
});
