// Real route/auth/booking handlers over isolated in-memory model persistence.
// This does not represent real MongoDB integration or browser verification.
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import * as models from "../src/models.js";
import { expandDemo } from "../src/demo-expansion.js";
import bcrypt from "bcryptjs";
import {
  demoDefinitions as ownerDefinitions,
  stableId,
} from "../src/owner-demo-providers.js";
import { canonicalCatalog } from "../src/canonical-catalog.js";
import { facultyConfirmation } from "../src/faculty-showcase.js";
import { paymentPlanSnapshot } from "../src/billing-domain.js";
import { demoProviders } from "../../seed-data/demo-accounts.js";
import {
  accountRows,
  temporaryPasswords,
} from "../../scripts/demo-account-guide.js";
import {
  canonicalCity,
  citySelection,
  supportedCities,
} from "../../shared/cities.js";
import { requireCity } from "../src/cities.js";
import { indiaDate, conversationTurn } from "../src/assistant-conversation.js";
const { User, Booking, File, Category } = models;
const tables = new Map();
const value = (r, k) => k.split(".").reduce((a, b) => a?.[b], r);
const eq = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);
function matches(r, f = {}) {
  return Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((f) => matches(r, f));
    if (k === "$and") return v.every((f) => matches(r, f));
    const a = value(r, k);
    if (v === null) return a == null;
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof mongoose.Types.ObjectId) &&
      !(v instanceof Date)
    )
      return Object.entries(v).every(([op, x]) =>
        op === "$in"
          ? (Array.isArray(a) ? a : [a]).some((a) => x.some((x) => eq(a, x)))
          : op === "$gt"
            ? a > x
            : op === "$lt"
              ? a < x
              : op === "$gte"
                ? a >= x
                : op === "$lte"
                  ? a <= x
                  : op === "$exists"
                    ? (a !== undefined) === x
                    : op === "$ne"
                      ? !eq(a, x)
                      : op === "$regex"
                        ? new RegExp(x, v.$options || "").test(a || "")
                        : op === "$options",
      );
    return Array.isArray(a) ? a.some((item) => eq(item, v)) : eq(a, v);
  });
}
const plain = (v) => (v?.toObject ? v.toObject() : v);
function query(v) {
  let lean = false,
    populate = [];
  const q = {
    then(resolve, reject) {
      let out = v;
      if (populate.length) {
        out = (Array.isArray(v) ? v : [v]).filter(Boolean).map((d) => {
          const row = plain(d);
          for (const key of populate)
            row[key] = plain(tables.get(User).find((u) => eq(u._id, row[key])));
          return row;
        });
        if (!Array.isArray(v)) out = out[0] || null;
      } else if (lean) out = Array.isArray(v) ? v.map(plain) : plain(v);
      return Promise.resolve(out).then(resolve, reject);
    },
    select() {
      return q;
    },
    sort() {
      return q;
    },
    limit() {
      return q;
    },
    skip() {
      return q;
    },
    lean() {
      lean = true;
      return q;
    },
    populate(k) {
      populate.push(k);
      return q;
    },
  };
  return q;
}
function update(doc, u, insert = false) {
  for (const [k, v] of Object.entries({
    ...(insert ? u.$setOnInsert : {}),
    ...u.$set,
  }))
    doc.set(k, v);
  for (const [k, v] of Object.entries(u.$inc || {}))
    doc.set(k, (value(doc, k) || 0) + v);
  for (const [k, v] of Object.entries(u.$push || {})) {
    const a = value(doc, k) || [];
    a.push(...(v.$each || [v]));
    doc.set(
      k,
      v.$slice === undefined
        ? a
        : v.$slice < 0
          ? a.slice(v.$slice)
          : a.slice(0, v.$slice),
    );
  }
  for (const [k, v] of Object.entries(u.$max || {}))
    if (value(doc, k) == null || value(doc, k) < v) doc.set(k, v);
  for (const k of Object.keys(u.$unset || {})) doc.set(k, undefined);
}
let app, env;
before(async () => {
  env = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    GHARSEVA_DEMO: "true",
    AUTH_DELIVERY_MODE: "test",
    PAYMENTS_MODE: "demo",
    JWT_SECRET: randomBytes(48).toString("hex"),
    CLIENT_ORIGIN: "http://localhost:5173",
  });
  for (const model of Object.values(models).filter((m) => m?.modelName)) {
    const rows = [];
    tables.set(model, rows);
    mock.method(model.prototype, "save", async function () {
      await this.validate();
      if (
        model === User &&
        rows.some(
          (u) =>
            !eq(u._id, this._id) &&
            (u.email === this.email || u.mobile === this.mobile),
        )
      )
        throw Object.assign(Error("duplicate"), { code: 11000 });
      if (
        model === Booking &&
        rows.some(
          (b) =>
            !eq(b._id, this._id) &&
            b.active &&
            this.active &&
            eq(b.provider, this.provider) &&
            b.date === this.date &&
            b.time === this.time,
        )
      )
        throw Object.assign(Error("duplicate"), { code: 11000 });
      const i = rows.findIndex((r) => eq(r._id, this._id));
      if (i < 0) rows.push(this);
      else rows[i] = this;
      return this;
    });
    mock.method(model, "create", async (input) =>
      Array.isArray(input)
        ? Promise.all(
            input.map(async (v) => {
              const d = new model(v);
              await d.save();
              return d;
            }),
          )
        : await new model(input).save(),
    );
    mock.method(model, "find", (f) => query(rows.filter((r) => matches(r, f))));
    mock.method(model, "findOne", (f) =>
      query(rows.find((r) => matches(r, f))),
    );
    mock.method(model, "findById", (id) =>
      query(rows.find((r) => eq(r._id, id))),
    );
    mock.method(model, "exists", async (f) => {
      const r = rows.find((r) => matches(r, f));
      return r ? { _id: r._id } : null;
    });
    mock.method(model, "distinct", async (field) => [
      ...new Set(rows.map((r) => value(r, field)).filter(Boolean)),
    ]);
    mock.method(
      model,
      "countDocuments",
      async (f = {}) => rows.filter((r) => matches(r, f)).length,
    );
    mock.method(model, "aggregate", async () => []);
    mock.method(model, "deleteOne", async (f) => {
      const i = rows.findIndex((r) => matches(r, f));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i < 0 ? 0 : 1 };
    });
    mock.method(model, "updateOne", async (f, u, o = {}) => {
      let r = rows.find((r) => matches(r, f));
      const insert = !r;
      if (!r && o.upsert) r = new model(f);
      if (r) {
        update(r, u, insert);
        await r.save();
      }
      return { modifiedCount: r ? 1 : 0 };
    });
    mock.method(model, "findOneAndUpdate", (f, u, o = {}) => {
      let r = rows.find((r) => matches(r, f));
      const insert = !r;
      if (!r && o.upsert) r = new model(f);
      if (r) {
        update(r, u, insert);
        if (insert) rows.push(r);
      }
      return query(r);
    });
  }
  app = createApp();
});
after(() => {
  mock.restoreAll();
  process.env = env;
});
async function call(
  path,
  { body, method = body ? "POST" : "GET", cookie, context, file } = {},
) {
  const url = new URL(path, "http://fixture.local");
  const route = app.router.stack.find(
    (l) =>
      l.route?.methods[method.toLowerCase()] &&
      new RegExp(
        "^" + l.route.path.replace(/:id|:provider/g, "([^/]+)") + "$",
      ).test("/api" + url.pathname),
  )?.route;
  assert.ok(route, "route exists: " + method + " " + path);
  const match = ("/api" + url.pathname).match(
    new RegExp("^" + route.path.replace(/:id|:provider/g, "([^/]+)") + "$"),
  );
  const req = {
    method,
    file,
    body: body || {},
    query: Object.fromEntries(url.searchParams),
    params: { id: match?.[1], provider: match?.[1] },
    headers: {
      cookie: cookie || "",
      ...(context ? { "x-gharseva-context": context } : {}),
    },
    is: () => false,
  };
  const result = { status: 200 },
    cookies = new Map(),
    headers = {};
  const res = {
    status(n) {
      result.status = n;
      return this;
    },
    json(d) {
      result.data = JSON.parse(JSON.stringify(d));
      return this;
    },
    set(k, v) {
      headers[k] = v;
      return this;
    },
    cookie(k, v) {
      cookies.set(k, k + "=" + v);
      return this;
    },
    clearCookie(k) {
      cookies.delete(k);
      return this;
    },
  };
  try {
    for (const layer of route.stack) {
      // Rate limiting and multipart parsing have separate HTTP integration suites.
      if (
        layer.name === "multerMiddleware" ||
        layer.handle.toString().startsWith("async (request, response, next)")
      )
        continue;
      let error;
      await layer.handle(req, res, (e) => {
        error = e;
      });
      if (error) throw error;
    }
  } catch (e) {
    result.status = e.status || 500;
    result.data = { message: e.message };
  }
  return {
    ...result,
    cookie: cookies.get("gharseva_session"),
    pending: cookies.get("gharseva_pending_login"),
    context: headers["X-GharSeva-Context"],
  };
}
async function login(email, password) {
  const first = await call("/auth/login", {
    body: { identifier: email, password },
  });
  assert.equal(first.status, 202, JSON.stringify(first.data));
  const result = await call("/auth/login/verify", {
    body: { code: first.data.demoCode },
    cookie: first.pending,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result;
}
let customerAuth, providerAuth, realCustomer, bookingId, approvalAdminAuth;
test("canonical city validation uses the existing catalogue, aliases and whitespace", () => {
  for (const city of ["Ahmedabad", " aHeMdAbAd ", " AHEMDABAD "])
    assert.equal(requireCity(city), "Ahmedabad");
  assert.equal(requireCity("  pune  "), "Pune");
  for (const bad of ["", null, {}, "Unsupported city", 123])
    assert.throws(() => requireCity(bad));
  assert.equal(new User().city, "");
  assert.ok(supportedCities.includes("Ahmedabad"));
});
test("registration rejects absent/unknown city and saves the canonical chosen city", async () => {
  const data = {
    name: "City Customer",
    email: "city-test@example.com",
    mobile: "9876599901",
    password: "CityTest123",
    terms: true,
    role: "customer",
  };
  for (const city of [undefined, "Atlantis", {}, "   "]) {
    const r = await call("/auth/register", { body: { ...data, city } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  }
  const r = await call("/auth/register", {
    body: { ...data, city: "  mUmBaI " },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  realCustomer = tables.get(User)[0];
  assert.equal(realCustomer.city, "Mumbai");
  assert.equal(r.data.city, "Mumbai");
  assert.equal(r.data.passwordHash, undefined);
});
test("expansion dry-run makes no writes and apply creates the full catalogue without touching real accounts", async () => {
  const before = JSON.stringify(plain(realCustomer));
  const dry = await expandDemo();
  assert.ok(dry.some((x) => x.action === "ADD ACCOUNT"));
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await Category.countDocuments(), 0);
  await expandDemo({ apply: true, passwords: temporaryPasswords });
  assert.equal(await User.countDocuments(), 35);
  assert.equal(JSON.stringify(plain(realCustomer)), before);
  assert.equal(await User.countDocuments({ role: "provider" }), 32);
  const fictionalProviders = await User.find({ role: "provider" });
  assert.ok(fictionalProviders.every((p) => p.profile.experience === 0));
  assert.ok(fictionalProviders.every((p) => !p.profile.documents?.length));
  assert.equal(tables.get(File).length, 0);
  assert.equal(await Booking.countDocuments(), 0);
  for (const c of await Category.find({ enabled: true }))
    assert.equal(
      await User.countDocuments({
        role: "provider",
        city: "Ahmedabad",
        "profile.category": c.slug,
        "profile.status": "APPROVED",
        "profile.available": true,
      }),
      2,
    );
});
test("repeated expansion preserves changed demo password, uploads, city, review/application and booking data", async () => {
  const p = await User.findOne({ email: "provider@gharseva.com" });
  p.passwordHash = "do-not-replace-hash";
  p.profile.portfolio = ["/api/files/aaaaaaaaaaaaaaaaaaaaaaaa"];
  p.city = "Delhi";
  p.profile.city = "Delhi";
  await p.save();
  tables
    .get(models.Review)
    .push({ _id: "review-preserve", feedback: "existing review" });
  tables.get(models.ProviderApplication).push({
    _id: "application-preserve",
    data: { city: "Pune" },
    state: "APPROVED",
  });
  tables.get(Booking).push({
    _id: "historical-preserve",
    status: "COMPLETED",
    active: false,
    address: "Original address",
  });
  const snapshot = JSON.stringify(
    [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
  );
  const report = await expandDemo({
    apply: true,
    passwords: { provider: "Different123" },
  });
  assert.ok(report.some((x) => x.action.startsWith("KEEP")));
  assert.equal(
    JSON.stringify(
      [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
    ),
    snapshot,
  );
});
test("seed and account listing have the same stable unique provider logins", () => {
  const rows = accountRows();
  assert.equal(rows.length, 34);
  assert.equal(new Set(demoProviders.map((p) => p.id)).size, 32);
  assert.equal(new Set(rows.map((r) => r.Email)).size, 34);
  assert.equal(new Set(rows.map((r) => r.Mobile)).size, 34);
  for (const p of demoProviders) {
    const r = rows.find((r) => r.Email === p.email);
    assert.equal(r.Name, p.name);
    assert.equal(r.Mobile, p.mobile);
    assert.equal(r.City, p.city);
    assert.equal(r["Temporary demo password"], "Provider123");
  }
});
test("saved city defaults on authenticated discovery and chatbot, explicit browsing does not save it", async () => {
  customerAuth = await login("customer@gharseva.com", "Customer123");
  const r = await call("/providers", customerAuth);
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 20);
  assert.ok(r.data.every((p) => p.city === "Ahmedabad"));
  assert.deepEqual((await call("/providers")).data, []);
  const browse = await call("/providers?city=pune", customerAuth);
  assert.equal(browse.data.length, 3);
  assert.equal(
    (await User.findOne({ email: "customer@gharseva.com" })).city,
    "Ahmedabad",
  );
  const conversation = await call("/assistant/conversation", {
    ...customerAuth,
    body: {
      state: {},
      event: { type: "message", value: "Tap leaking" },
      mode: "guided",
    },
  });
  assert.equal(conversation.status, 200, JSON.stringify(conversation.data));
  assert.equal(conversation.data.state.city, "Ahmedabad");
  assert.notEqual(conversation.data.question, "Which city should I search in?");
  const matches = await call(
    "/assistant/matches?category=plumbing",
    customerAuth,
  );
  assert.equal(matches.data.providers.length, 2);
  assert.ok(matches.data.providers.every((p) => p.city === "Ahmedabad"));
});
test("unapproved, suspended and unavailable local professionals never enter recommendations", async () => {
  const p = await User.findOne({ email: "ahm.plumbing2@example.com" });
  for (const [key, bad, good] of [
    ["profile.status", "PENDING", "APPROVED"],
    ["status", "SUSPENDED", "ACTIVE"],
    ["profile.available", false, true],
  ]) {
    p.set(key, bad);
    await p.save();
    const list = await call("/providers?city=Ahemdabad");
    assert.ok(!list.data.some((u) => u._id === String(p._id)));
    const match = await call(
      "/assistant/matches?category=plumbing&city=Ahmedabad",
    );
    assert.ok(!match.data.providers.some((u) => u._id === String(p._id)));
    p.set(key, good);
    await p.save();
  }
});
test("city changes clear provider, locality and time in shared state and the actual chatbot", async () => {
  const state = {
    category: "plumbing",
    city: "Ahmedabad",
    area: "Satellite",
    providerId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    date: indiaDate(1),
    time: "09:00",
  };
  assert.deepEqual(
    { ...citySelection(state, "Pune"), date: undefined },
    {
      ...state,
      city: "Pune",
      area: "",
      providerId: "",
      time: "",
      date: undefined,
    },
  );
  const turn = await conversationTurn(
    { state, event: { type: "preferences", city: "Pune" } },
    { categories: [{ slug: "plumbing" }], cities: supportedCities },
  );
  assert.equal(turn.state.providerId, "");
  assert.equal(turn.state.time, "");
  assert.equal(turn.state.area, "");
});
test("only explicit default-city saving changes the customer and legacy missing-city prompt can persist once", async () => {
  const r = await call("/auth/me/city", {
    ...customerAuth,
    method: "PATCH",
    body: { city: "  AHEmDABAD  " },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.city, "Ahmedabad");
  assert.equal(
    (
      await call("/auth/me/city", {
        ...customerAuth,
        method: "PATCH",
        body: { city: "unknown" },
      })
    ).status,
    400,
  );
  const auth = await login(realCustomer.email, "CityTest123");
  realCustomer.city = "";
  await realCustomer.save();
  assert.equal((await call("/auth/me", auth)).data.city, "");
  assert.equal(
    (
      await call("/auth/me/city", {
        ...auth,
        method: "PATCH",
        body: { city: "Pune" },
      })
    ).data.city,
    "Pune",
  );
  assert.equal((await User.findById(realCustomer._id)).city, "Pune");
});
test("booking and assistant draft validate service city, keep full address, and bind to the selected provider", async () => {
  const provider = await User.findOne({ email: "ahm.plumbing1@example.com" });
  const body = {
    providerId: String(provider._id),
    category: "plumbing",
    date: indiaDate(2),
    time: "09:00",
    city: "Mumbai",
    address: "42 Sample Road, Satellite, Ahmedabad",
  };
  assert.equal(
    (await call("/bookings", { ...customerAuth, body })).status,
    409,
  );
  assert.equal(
    (await call("/assistant/drafts", { ...customerAuth, body })).status,
    409,
  );
  assert.equal(
    (
      await call("/bookings", {
        ...customerAuth,
        body: { ...body, city: "Ahmedabad", address: "short" },
      })
    ).status,
    400,
  );
  const r = await call("/bookings", {
    ...customerAuth,
    body: { ...body, city: " ahemdabad " },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.city, "Ahmedabad");
  assert.equal(r.data.status, "PENDING");
  assert.equal(r.data.provider._id, String(provider._id));
  assert.equal(r.data.address, body.address);
  bookingId = r.data._id;
  providerAuth = await login(provider.email, "Provider123");
});
test("the exact provider sees and accepts the real PENDING request; customer sees ACCEPTED", async () => {
  const before = await call("/bookings", providerAuth);
  assert.ok(
    before.data.some((b) => b._id === bookingId && b.status === "PENDING"),
  );
  assert.equal(before.data[0].visitCode, undefined);
  const wrong = await login("ahm.plumbing2@example.com", "Provider123");
  assert.ok(
    !(await call("/bookings", wrong)).data.some((b) => b._id === bookingId),
  );
  assert.equal(
    (
      await call(`/bookings/${bookingId}/status`, {
        ...wrong,
        method: "PATCH",
        body: { status: "ACCEPTED" },
      })
    ).status,
    403,
  );
  const accepted = await call(`/bookings/${bookingId}/status`, {
    ...providerAuth,
    method: "PATCH",
    body: { status: "ACCEPTED" },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const after = await call("/bookings", customerAuth);
  assert.equal(after.data.find((b) => b._id === bookingId).status, "ACCEPTED");
  assert.match(
    after.data.find((b) => b._id === bookingId).visitCode,
    /^\d{6}$/,
  );
});
test("provider account and service-profile city stay consistent when saved", async () => {
  const p = await User.findOne({ email: "ahm.plumbing1@example.com" });
  assert.equal(
    (
      await call("/auth/me/city", {
        ...providerAuth,
        method: "PATCH",
        body: { city: " pune " },
      })
    ).status,
    200,
  );
  assert.equal(p.city, "Pune");
  assert.equal(p.profile.city, "Pune");
  // Restore only this isolated fixture; no user database is involved.
  p.city = "Ahmedabad";
  p.profile.city = "Ahmedabad";
});

test("assistant drafts retain the service city and recheck it at confirmation", async () => {
  const provider = await User.findOne({ email: "ahm.electrical1@example.com" });
  const body = {
    providerId: String(provider._id),
    category: "electrical",
    date: indiaDate(3),
    time: "11:00",
    city: "Ahmedabad",
    address: "42 Sample Society, Satellite, Ahmedabad",
  };
  const draft = await call("/assistant/drafts", { ...customerAuth, body });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const stored = await models.AssistantBookingDraft.findById(draft.data._id);
  assert.equal(stored.city, "Ahmedabad");
  provider.profile.city = "Pune";
  await provider.save();
  assert.equal(
    (
      await call(`/assistant/drafts/${stored._id}/confirm`, {
        ...customerAuth,
        body: { confirm: true },
      })
    ).status,
    409,
  );
  provider.profile.city = "Ahmedabad";
  await provider.save();
  const confirmed = await call(`/assistant/drafts/${stored._id}/confirm`, {
    ...customerAuth,
    body: { confirm: true },
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.city, "Ahmedabad");
});
test("identifier collisions and production expansion are preserved or rejected without writes", async () => {
  const p = await User.findOne({ email: "ahm.gardening2@example.com" });
  p.name = "Renamed genuine-looking account";
  await p.save();
  const before = JSON.stringify(
    [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
  );
  const report = await expandDemo({ apply: true });
  assert.ok(
    report.some(
      (r) => r.id === "ahm-gardening-2" && r.action.startsWith("CONFLICT"),
    ),
  );
  assert.equal(
    JSON.stringify(
      [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
    ),
    before,
  );
  process.env.NODE_ENV = "production";
  await assert.rejects(() => expandDemo({ apply: true }), /production/);
  process.env.NODE_ENV = "test";
});

test("provider registration persists the canonical city in account, service profile and pending application", async () => {
  const body = {
    name: "New City Professional",
    identityWorkflow: true,
    email: "new.city.provider@example.com",
    mobile: "9876599902",
    password: "ProviderCity123",
    role: "provider",
    terms: true,
    city: "  AHEMDABAD ",
    category: "plumbing",
    categories: ["plumbing"],
    area: "Satellite",
    bio: "A qualified professional applying to offer residential plumbing services.",
    experience: 3,
    price: 399,
    skills: ["Pipe repair"],
  };
  const r = await call("/auth/register", {
    body,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const u = await User.findOne({ email: body.email });
  assert.equal(u.city, "Ahmedabad");
  assert.equal(u.profile.city, "Ahmedabad");
  assert.equal(u.profile.status, "PENDING");
  const application = await models.ProviderApplication.findOne({ user: u._id });
  assert.equal(application.data.city, "Ahmedabad");
});

test("generated local guide lists every fictional account and public discovery exposes no credentials", async () => {
  const guide = readFileSync(
    new URL("../../DEMO_ACCOUNTS.md", import.meta.url),
    "utf8",
  );
  for (const row of accountRows()) {
    assert.ok(guide.includes(row.Name));
    assert.ok(guide.includes(row.Email));
    assert.ok(guide.includes(row.Mobile));
  }
  const r = await call("/providers?city=Ahmedabad");
  for (const p of r.data)
    for (const field of [
      "email",
      "mobile",
      "password",
      "passwordHash",
      "documents",
    ])
      assert.equal(p[field], undefined);
});

test("category-filtered discovery and assistant use only enabled categories and preserve rejected/suspended/disabled profiles", async () => {
  const plumbing = await Category.findOne({ slug: "plumbing" });
  const p = await User.findOne({ email: "ahm.plumbing1@example.com" });
  for (const status of ["PENDING", "REJECTED"]) {
    p.profile.status = status;
    await p.save();
    assert.ok(
      !(await call("/providers?city=Ahmedabad&category=plumbing")).data.some(
        (r) => r._id === String(p._id),
      ),
    );
  }
  p.profile.status = "APPROVED";
  const oldCategories = [...p.profile.categories];
  p.profile.categories = ["plumbing", "electrical"];
  await p.save();
  assert.ok(
    (await call("/providers?city=Ahmedabad&category=electrical")).data.some(
      (r) => r._id === String(p._id),
    ),
  );
  p.profile.categories = oldCategories;
  await p.save();
  plumbing.enabled = false;
  await plumbing.save();
  assert.deepEqual(
    (await call("/providers?city=Ahemdabad&category=plumbing")).data,
    [],
  );
  assert.ok(
    !(await call("/categories")).data.some((c) => c.slug === "plumbing"),
  );
  assert.equal(
    (await call("/assistant/matches?category=plumbing&city=Ahmedabad")).status,
    400,
  );
  const before = JSON.stringify(plain(plumbing));
  await expandDemo({ apply: true });
  assert.equal(
    JSON.stringify(plain(plumbing)),
    before,
    "disabled decision changed",
  );
  plumbing.enabled = true;
  await plumbing.save();
  const selected = await call("/providers?city=  ahemdabad &category=plumbing");
  assert.ok(selected.data.length >= 1);
  assert.ok(selected.data.every((p) => p.categories.includes("plumbing")));
  assert.deepEqual(
    (await call("/providers?city=Ahmedabad&category=unknown")).data,
    [],
  );
});

test("simple provider approval needs no documents, reuses admin proof and rejects unauthorized or stale decisions", async () => {
  const p = await User.findOne({ email: "new.city.provider@example.com" });
  assert.equal(p.profile.documents.length, 0);
  assert.equal(p.profile.identityRequired, false);
  const admin = await login("admin@gharseva.com", "Admin12345");
  approvalAdminAuth = admin;
  const pro = await login(p.email, "ProviderCity123");
  p.city = "Surat";
  p.profile.city = "";
  p.profile.category = "";
  p.profile.categories = [];
  p.profile.area = "";
  p.profile.bio = "";
  p.profile.price = undefined;
  p.profile.experience = undefined;
  p.profile.photo = "";
  p.profile.days = [];
  p.profile.slots = [];
  p.profile.available = false;
  const session = tables
    .get(models.AuthSession)
    .find((s) => s.context === admin.context);
  session.reauthenticatedAt = new Date(Date.now() - 6 * 60000);
  const application = await models.ProviderApplication.findOne({ user: p._id });
  const decide = (
    auth,
    action = "APPROVED",
    revision = application.revision,
    note,
  ) =>
    call("/admin/applications/" + application._id, {
      ...auth,
      method: "PATCH",
      body: { action, revision, note },
    });
  assert.equal((await decide(customerAuth)).status, 403);
  assert.equal((await decide(pro)).status, 403);
  assert.equal((await decide({})).status, 401);
  const waiting = await call("/admin/applications", admin);
  assert.equal(waiting.status, 200, JSON.stringify(waiting.data));
  assert.equal(
    waiting.data.items.find((a) => a._id === String(application._id))
      .approvalReadiness.ready,
    true,
  );
  // Historical optional evidence is retained even when expired/unreviewed.
  const record = await models.ProviderIdentity.create({
    provider: p._id,
    accountName: p.name,
    state: "SUBMITTED",
    evidenceExpiresAt: new Date(0),
  });
  p.profile.identityRequired = true;
  const evidenceSnapshot = JSON.stringify(record.toObject());
  const originalUpdate = User.findOneAndUpdate;
  const racingUpdate = mock.method(
    User,
    "findOneAndUpdate",
    (filter, update, options) => {
      if (eq(filter._id, p._id)) p.status = "SUSPENDED";
      return originalUpdate(filter, update, options);
    },
  );
  try {
    assert.equal((await decide(admin)).status, 409);
    assert.equal(p.profile.status, "PENDING");
  } finally {
    racingUpdate.mock.restore();
    p.status = "ACTIVE";
  }
  assert.equal((await decide(admin)).status, 200);
  assert.equal(p.profile.status, "APPROVED");
  assert.equal(String(p.profile.approvedBy), String(session.user));
  assert.ok(p.profile.approvedAt);
  assert.equal(JSON.stringify(record.toObject()), evidenceSnapshot);
  assert.equal(
    p.profile.identityRequired,
    true,
    "historical flags are preserved, not mandatory",
  );
  assert.ok(application.history.some((h) => h.action === "APPROVED"));
  assert.equal(
    (await decide(admin, "REJECTED", application.revision - 1)).status,
    409,
  );
  const approvedAt = p.profile.approvedAt.getTime(),
    approvedBy = String(p.profile.approvedBy),
    historyLength = application.history.length,
    revision = application.revision;
  const repeat = await decide(admin, "APPROVED", revision - 1);
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.idempotent, true);
  assert.equal(
    (
      await call("/admin/users/" + p._id, {
        ...admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  assert.equal(application.history.length, historyLength);
  assert.equal(application.revision, revision);
  assert.equal(p.profile.approvedAt.getTime(), approvedAt);
  assert.equal(String(p.profile.approvedBy), approvedBy);
  assert.equal(String(application.approvedBy), approvedBy);
  assert.equal(application.approvedAt.getTime(), approvedAt);
  assert.ok(
    !(await call("/providers?city=Ahmedabad&category=plumbing")).data.some(
      (u) => u._id === String(p._id),
    ),
  );
  const own = await call("/provider/application", pro);
  assert.equal(
    own.data.discoveryReadiness.message,
    "Complete service details to appear in searches.",
  );
  p.profile.category = "plumbing";
  p.profile.categories = ["plumbing"];
  p.profile.city = "Ahmedabad";
  assert.equal(
    (
      await call("/bookings", {
        ...customerAuth,
        body: {
          providerId: String(p._id),
          category: "plumbing",
          city: "Ahmedabad",
          date: indiaDate(8),
          time: "14:00",
          address: "42 Fixture Address, Ahmedabad",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await decide(admin, "REJECTED", application.revision, "x")).status,
    200,
  );
  assert.equal(p.profile.status, "REJECTED");
  assert.ok(
    !(await call("/providers?city=Ahmedabad&category=plumbing")).data.some(
      (u) => u._id === String(p._id),
    ),
  );
  const approved = await call("/admin/users/" + p._id, {
    ...admin,
    method: "PATCH",
    body: { approval: "APPROVED" },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal(p.profile.status, "APPROVED");
  assert.equal(
    (
      await call("/admin/users/" + p._id, {
        ...admin,
        method: "PATCH",
        body: { status: "SUSPENDED" },
      })
    ).status,
    403,
  );
  const completed = await call("/auth/me", {
    ...pro,
    method: "PATCH",
    body: {
      name: p.name,
      email: p.email,
      mobile: p.mobile,
      city: "Ahmedabad",
      profile: {
        category: "plumbing",
        categories: ["plumbing"],
        city: "Ahmedabad",
        area: "Satellite",
        bio: "A complete plumbing service profile for the isolated booking demonstration.",
        price: 399,
        experience: 0,
        available: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        slots: ["09:00", "11:00", "14:00", "16:00"],
      },
    },
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.data));
  assert.equal(p.profile.status, "APPROVED");
  assert.ok(
    (await call("/providers?city=Ahemdabad&category=plumbing")).data.some(
      (u) => u._id === String(p._id),
    ),
  );
  assert.equal(p.status, "ACTIVE");
});

test("both admin approval paths serialize concurrent decisions and recover a partial application write without duplicate audit", async () => {
  const p = await User.findOne({ email: "new.city.provider@example.com" });
  const application = await models.ProviderApplication.findOne({ user: p._id });
  const admin = approvalAdminAuth;
  p.profile.status = "PENDING";
  application.state = "SUBMITTED";
  const revision = application.revision,
    historyLength = application.history.length;
  const original = models.ProviderApplication.findOneAndUpdate;
  const failFinish = mock.method(
    models.ProviderApplication,
    "findOneAndUpdate",
    (filter, update, options) => {
      if (update.$set?.state === "APPROVED")
        throw Error("Isolated fixture application persistence failure");
      return original(filter, update, options);
    },
  );
  const approve = () =>
    call("/admin/applications/" + application._id, {
      ...admin,
      method: "PATCH",
      body: { action: "APPROVED", revision },
    });
  try {
    assert.equal((await approve()).status, 500);
    assert.equal(p.profile.status, "APPROVED");
    assert.equal(application.state, "SUBMITTED");
    assert.equal(application.reviewLockUntil, undefined);
    assert.equal(application.history.length, historyLength);
  } finally {
    failFinish.mock.restore();
  }
  const at = p.profile.approvedAt.getTime();
  assert.equal((await approve()).status, 200);
  assert.equal(application.state, "APPROVED");
  assert.equal(application.history.length, historyLength + 1);
  assert.equal(p.profile.approvedAt.getTime(), at);
  assert.equal((await approve()).data.idempotent, true);
  assert.equal(application.history.length, historyLength + 1);
  p.profile.status = "PENDING";
  application.state = "SUBMITTED";
  const before = application.history.length,
    current = application.revision;
  const results = await Promise.all([
    call("/admin/applications/" + application._id, {
      ...admin,
      method: "PATCH",
      body: { action: "APPROVED", revision: current },
    }),
    call("/admin/users/" + p._id, {
      ...admin,
      method: "PATCH",
      body: { approval: "REJECTED", note: "No" },
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(application.history.length, before + 1);
  assert.equal(application.state, p.profile.status);
  assert.equal(
    (
      await call("/admin/users/" + p._id, {
        ...admin,
        method: "PATCH",
        body: { approval: "APPROVED" },
      })
    ).status,
    200,
  );
  assert.equal(p.profile.status, "APPROVED");
});

test("one full isolated booking journey retains provider ownership, admin read access, OTP and two distinct simulated collections", async () => {
  mock.method(models.Payment.collection, "indexes", async () => [
    { name: "_id_", key: { _id: 1 }, unique: true },
    {
      name: "payment_booking_purpose",
      key: { booking: 1, purpose: 1 },
      unique: true,
    },
  ]);
  const p = await User.findOne({ email: "new.city.provider@example.com" });
  // Advance only the isolated fixture send window; no real waiting or production rate-limit change.
  for (const row of tables.get(models.ContactThrottle)) {
    row.nextAllowedAt = new Date(0);
    row.windowStart = new Date(0);
    row.count = 0;
  }
  const owner = await login("customer@gharseva.com", "Customer123");
  const pro = await login(p.email, "ProviderCity123");
  const wrong = await login("ahm.plumbing2@example.com", "Provider123");
  const admin = await login("admin@gharseva.com", "Admin12345");
  const created = await call("/bookings", {
    ...owner,
    body: {
      providerId: String(p._id),
      category: "plumbing",
      date: indiaDate(7),
      time: "14:00",
      city: "  Ahemdabad ",
      address: "42 Fictional Sample Street, Ahmedabad",
      notes: "Isolated milestone fixture only",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data._id;
  const status = (auth, value, code) =>
    call("/bookings/" + id + "/status", {
      ...auth,
      method: "PATCH",
      body: { status: value, code },
    });
  const order = (purpose = "VISIT_DEPOSIT") =>
    call("/payments/booking/" + id + "/order", {
      ...owner,
      body: {
        purpose,
        acceptDeposit: true,
        acceptBalance: true,
        amount: 1,
      },
    });
  assert.equal((await order()).status, 409, "PENDING must not be payable");
  assert.equal((await status(wrong, "ACCEPTED")).status, 403);
  assert.equal((await status(admin, "ACCEPTED")).status, 403);
  assert.equal((await status(pro, "ACCEPTED")).status, 200);
  for (const auth of [owner, pro, admin]) {
    const list = await call("/bookings", auth);
    assert.equal(list.status, 200);
    assert.equal(list.data.find((b) => b._id === id).status, "ACCEPTED");
  }
  const unauthorized = await call("/payments/booking/" + id, wrong);
  assert.equal(unauthorized.status, 404);
  process.env.PAYMENTS_MODE = "disabled";
  const unavailable = await order();
  assert.equal(unavailable.status, 503);
  assert.ok(unavailable.data.message);
  process.env.PAYMENTS_MODE = "demo";
  const deposit = await order();
  assert.equal(deposit.status, 200, JSON.stringify(deposit.data));
  assert.equal(deposit.data.payment.amount, 9900);
  const pay = (entry, outcome) =>
    call("/payments/" + entry._id + "/demo", { ...owner, body: { outcome } });
  assert.equal((await status(pro, "ON_THE_WAY")).status, 200);
  const ownBooking = (await call("/bookings", owner)).data.find(
    (b) => b._id === id,
  );
  const visitCode = ownBooking.visitCode;
  assert.equal((await status(pro, "IN_PROGRESS", visitCode)).status, 409);
  assert.equal((await pay(deposit.data.payment, "FAILED")).status, 200);
  assert.equal((await status(pro, "IN_PROGRESS", visitCode)).status, 409);
  assert.equal((await pay(deposit.data.payment, "CAPTURED")).status, 200);
  assert.equal((await status(pro, "IN_PROGRESS", "000000")).status, 400);
  assert.equal((await status(pro, "IN_PROGRESS", visitCode)).status, 200);
  assert.equal((await status(pro, "COMPLETED")).status, 200);
  const submitted = await call("/payments/booking/" + id + "/bill", {
    ...pro,
    body: {
      requestId: "catalog-fixture-bill-001",
      total: 1,
      items: [
        {
          kind: "SERVICE",
          label: "Fictional plumbing visit",
          quantity: 1,
          unitAmount: 34900,
        },
      ],
    },
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.data));
  assert.equal(submitted.data.bill.total, 34900);
  assert.equal((await order("FINAL_BALANCE")).status, 409);
  const approve = await call("/payments/booking/" + id + "/bill/decision", {
    ...owner,
    body: {
      version: 1,
      decision: "APPROVED",
      confirm: true,
    },
  });
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  const balance = await order("FINAL_BALANCE");
  assert.equal(balance.status, 200, JSON.stringify(balance.data));
  assert.equal(balance.data.payment.amount, 25000);
  assert.notEqual(balance.data.payment._id, deposit.data.payment._id);
  assert.notEqual(balance.data.payment.orderId, deposit.data.payment.orderId);
  assert.equal((await pay(balance.data.payment, "CAPTURED")).status, 200);
  const summary = (await call("/payments/booking/" + id, owner)).data;
  assert.equal(summary.summary.grossCaptured, 34900);
  assert.equal(summary.summary.remaining, 0);
  assert.equal(summary.summary.payoutStatus, "NOT_INITIATED");
  assert.equal(summary.payments.length, 2);
  assert.equal(summary.booking.status, "COMPLETED");
});

test("fresh reserved-address expansion creates a private ignored guide only for new fixture accounts and repeat preserves everything", async () => {
  const prior = new Map([...tables].map(([model, rows]) => [model, [...rows]]));
  try {
    for (const rows of tables.values()) rows.length = 0;
    const passwords = {
      customer: "FixtureCustomer7!",
      provider: "FixtureProvider7!",
      admin: "FixtureAdmin7!",
    };
    const report = await expandDemo({
      apply: true,
      passwords,
      testOnlyContacts: true,
    });
    assert.equal(report.filter((r) => r.created).length, 34);
    assert.ok(tables.get(User).every((u) => u.email.endsWith("@example.test")));
    assert.equal(tables.get(Booking).length, 0);
    const { writeLocalDemoGuide } =
      await import("../../scripts/local-demo-guide.js");
    const guide = await writeLocalDemoGuide(report, passwords, {
      database: "gharseva_test_catalog_in_memory",
      testOnlyContacts: true,
      fixture: true,
    });
    assert.ok(guide.endsWith("catalog-fixture-accounts.local.md"));
    const text = readFileSync(guide, "utf8");
    assert.match(text, /IN-MEMORY TEST FIXTURE ONLY/);
    assert.ok(text.includes("ahm-plumbing-1@example.test"));
    const snapshot = JSON.stringify(
      [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
    );
    const again = await expandDemo({
      apply: true,
      passwords: { provider: "DifferentFixture7!" },
      testOnlyContacts: true,
    });
    assert.equal(again.filter((r) => r.created).length, 0);
    assert.equal(await writeLocalDemoGuide(again, {}, { fixture: true }), null);
    assert.equal(
      JSON.stringify(
        [...tables].map(([m, rows]) => [m.modelName, rows.map(plain)]),
      ),
      snapshot,
    );
  } finally {
    for (const [model, rows] of tables) {
      rows.length = 0;
      rows.push(...prior.get(model));
    }
  }
});

test("faculty showcase routes preserve approvals, require admin confirmation and cannot create bookings/payments", async () => {
  const prior = new Map([...tables].map(([m, rows]) => [m, [...rows]])),
    previousDatabase = mongoose.connection.name;
  const previousMode = process.env.PAYMENTS_MODE;
  try {
    mongoose.connection.name = "gharseva_faculty_test";
    for (const rows of tables.values()) rows.length = 0;
    process.env.PAYMENTS_MODE = "demo";
    const hash = await bcrypt.hash("ShowcaseFixture7!", 4);
    const admin = new User({
      name: "Fixture admin",
      email: "showcase-admin@example.test",
      mobile: "9000000001",
      role: "admin",
      passwordHash: hash,
      city: "Ahmedabad",
    });
    const customer = new User({
      name: "Fixture customer",
      email: "showcase-customer@example.test",
      mobile: "9000000002",
      role: "customer",
      passwordHash: hash,
      city: "Ahmedabad",
    });
    const imported = ownerDefinitions.map(
      (p) =>
        new User({
          _id: stableId(mongoose.connection.name, p.id),
          demoAccountId: "owner-demo:" + p.id,
          name: "DEMO / Fictional professional: " + p.name,
          email: p.id + "@example.test",
          mobile: p.mobile,
          passwordHash: hash,
          role: "provider",
          city: "Ahmedabad",
          profile: {
            demoProviderId: p.id,
            category: p.serviceId,
            categories: [p.serviceId],
            status: "PENDING",
            identityRequired: true,
            city: "Ahmedabad",
            area: p.location,
            price: p.price,
            available: true,
            documents: [],
            portfolio: [],
          },
        }),
    );
    const approved = new User({
      name: "Real approved fixture",
      email: "approved@example.test",
      mobile: "9000000003",
      passwordHash: hash,
      role: "provider",
      city: "Ahmedabad",
      profile: {
        category: "plumbing",
        categories: ["plumbing"],
        city: "Ahmedabad",
        area: "Test area",
        status: "APPROVED",
        available: true,
      },
    });
    const pending = new User({
      name: "Real pending fixture",
      email: "pending@example.test",
      mobile: "9000000004",
      passwordHash: hash,
      role: "provider",
      city: "Ahmedabad",
      profile: {
        category: "plumbing",
        city: "Ahmedabad",
        status: "PENDING",
        available: true,
      },
    });
    tables.get(User).push(admin, customer, approved, pending, ...imported);
    tables.get(Category).push(...canonicalCatalog.map((c) => new Category(c)));
    const controls = new models.Settings({
      key: "main",
      facultyDemoEnabled: false,
    });
    tables.get(models.Settings).push(controls);
    const baseline = JSON.stringify(tables.get(User).map(plain));
    const owner = await login(customer.email, "ShowcaseFixture7!");
    const root = await login(admin.email, "ShowcaseFixture7!");
    assert.equal((await call("/admin/faculty-showcase")).status, 401);
    assert.equal((await call("/admin/faculty-showcase", owner)).status, 403);
    assert.equal(
      (
        await call("/admin/faculty-showcase", {
          ...owner,
          body: { enabled: true },
        })
      ).status,
      403,
    );
    const preview = (await call("/admin/faculty-showcase?enabled=1", root))
      .data;
    assert.equal(preview.eligibleCount, 20);
    assert.equal(preview.canEnable, true);
    assert.ok(Object.values(preview.categoryCounts).every((n) => n === 2));
    assert.equal(controls.facultyDemoEnabled, false);
    assert.equal(
      (await call("/providers?city=Ahmedabad&facultyDemo=1")).data.length,
      1,
    );
    const payload = {
      enabled: true,
      revision: preview.revision,
      fingerprint: preview.fingerprint,
      confirmation: facultyConfirmation(true),
    };
    assert.equal(
      (
        await call("/admin/faculty-showcase", {
          ...root,
          body: { ...payload, confirmation: "yes" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/admin/faculty-showcase", {
          ...root,
          body: { ...payload, revision: 99 },
        })
      ).status,
      409,
    );
    imported[0].profile.identityRequired = false;
    assert.equal(
      (await call("/admin/faculty-showcase", { ...root, body: payload }))
        .status,
      409,
    );
    imported[0].profile.identityRequired = true;
    assert.equal(
      (await call("/admin/faculty-showcase", { ...root, body: payload }))
        .status,
      200,
    );
    assert.equal(controls.facultyDemoAudit.length, 1);
    assert.equal(
      (await call("/admin/faculty-showcase", { ...root, body: payload })).data
        .unchanged,
      true,
    );
    assert.equal(controls.facultyDemoAudit.length, 1);
    const listings = (
      await call("/providers?city=%20Ahemdabad%20&facultyDemo=1")
    ).data;
    assert.equal(listings.length, 21);
    assert.equal(listings.filter((p) => p.facultyDemo).length, 20);
    assert.equal((await call("/providers?city=Ahmedabad")).data.length, 1);
    assert.equal(
      (await call("/providers?city=Pune&facultyDemo=1")).data.length,
      0,
    );
    const plumbing = (
      await call("/providers?city=Ahmedabad&category=plumbing&facultyDemo=1")
    ).data;
    assert.equal(plumbing.filter((p) => p.facultyDemo).length, 2);
    for (const p of listings.filter((p) => p.facultyDemo)) {
      assert.equal(
        p.facultyDemoLabel,
        "DEMO PROFILE — Fictional, not identity verified",
      );
      assert.equal(p.bookingAllowed, false);
      assert.equal(p.rating, 0);
      assert.equal(p.completed, 0);
      for (const key of [
        "email",
        "mobile",
        "passwordHash",
        "documents",
        "identityRequired",
        "status",
      ])
        assert.equal(p[key], undefined);
    }
    const demo = imported[0];
    assert.equal((await call("/providers/" + demo._id)).status, 404);
    const detail = await call("/providers/" + demo._id + "?facultyDemo=1");
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.data.feedback, []);
    assert.equal(
      (await call("/providers/" + demo._id + "/slots?date=" + indiaDate(2)))
        .status,
      404,
    );
    const matches = await call(
      "/assistant/matches?city=Ahmedabad&category=plumbing&facultyDemo=1",
    );
    assert.equal(matches.status, 200);
    assert.equal(matches.data.providers.filter((p) => p.facultyDemo).length, 2);
    const request = {
      providerId: String(demo._id),
      category: "plumbing",
      city: "Ahmedabad",
      date: indiaDate(2),
      time: "09:00",
      address: "Fictional test service address",
    };
    assert.equal(
      (await call("/bookings", { ...owner, body: request })).status,
      404,
    );
    // Even a mistaken out-of-band approval cannot turn an imported showcase into a real booking target.
    demo.profile.status = "APPROVED";
    assert.equal(
      (await call("/bookings", { ...owner, body: request })).status,
      403,
    );
    assert.equal(
      (await call("/assistant/drafts", { ...owner, body: request })).status,
      403,
    );
    const b = new Booking({
      customer: customer._id,
      provider: demo._id,
      category: "plumbing",
      service: "Plumbing",
      status: "ACCEPTED",
      city: "Ahmedabad",
      date: indiaDate(2),
      time: "09:00",
      address: request.address,
      price: 299,
      paymentPlan: paymentPlanSnapshot(299),
    });
    tables.get(Booking).push(b);
    assert.equal(
      (
        await call(`/payments/booking/${b._id}/order`, {
          ...owner,
          body: { purpose: "VISIT_DEPOSIT", acceptDeposit: true },
        })
      ).status,
      409,
    );
    assert.equal(tables.get(models.Payment).length, 0);
    const pro = await login(demo.email, "ShowcaseFixture7!");
    assert.equal(
      (
        await call(`/bookings/${b._id}/status`, {
          ...pro,
          method: "PATCH",
          body: { status: "ON_THE_WAY" },
        })
      ).status,
      403,
    );
    demo.profile.status = "PENDING";
    const cat = tables.get(Category).find((c) => c.slug === "plumbing");
    cat.enabled = false;
    assert.equal(
      (await call("/providers?city=Ahmedabad&category=plumbing&facultyDemo=1"))
        .data.length,
      0,
    );
    cat.enabled = true;
    imported[1].profile.available = false;
    assert.equal(
      (await call("/providers?city=Ahmedabad&facultyDemo=1")).data.filter(
        (p) => p.facultyDemo,
      ).length,
      19,
    );
    imported[1].profile.available = true;
    const off = await call("/admin/faculty-showcase?enabled=0", root);
    const disable = {
      enabled: false,
      revision: off.data.revision,
      confirmation: facultyConfirmation(false),
    };
    assert.equal(
      (await call("/admin/faculty-showcase", { ...root, body: disable }))
        .status,
      200,
    );
    assert.equal(
      (await call("/admin/faculty-showcase", { ...root, body: disable })).data
        .unchanged,
      true,
    );
    assert.equal(controls.facultyDemoAudit.length, 2);
    assert.equal(
      (await call("/providers?city=Ahmedabad&facultyDemo=1")).data.length,
      1,
    );
    const adminSession = tables
      .get(models.AuthSession)
      .find((s) => String(s.user) === String(admin._id));
    adminSession.reauthenticatedAt = new Date(0);
    const stalePreview = (await call("/admin/faculty-showcase?enabled=1", root))
      .data;
    assert.equal(
      (
        await call("/admin/faculty-showcase", {
          ...root,
          body: {
            enabled: true,
            revision: stalePreview.revision,
            fingerprint: stalePreview.fingerprint,
            confirmation: facultyConfirmation(true),
          },
        })
      ).status,
      403,
      "mutations retain recent admin password/OTP proof requirement",
    );
    assert.equal(
      JSON.stringify(tables.get(User).map(plain)),
      baseline,
      "all user fields and approvals are preserved",
    );
  } finally {
    mongoose.connection.name = previousDatabase;
    process.env.PAYMENTS_MODE = previousMode;
    for (const [model, rows] of tables) {
      rows.length = 0;
      rows.push(...prior.get(model));
    }
  }
});
