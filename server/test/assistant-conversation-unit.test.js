import { memoryCookie, fixtureContext } from "./session-fixture.js";
// Exercise the real discovery, authorization and shared booking handlers without
// TCP/MongoDB. Mock persistence implements the declared unique indexes atomically;
// service-assistant.test.js is the separate real MongoDB/HTTP integration suite.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import {
  AuthSession,
  User,
  Category,
  Booking,
  Review,
  File,
  Settings,
  AssistantBookingDraft,
} from "../src/models.js";
import {
  publicProviders,
  createCustomerBooking,
  bookingView,
} from "../src/app.js";
import { mountAssistant } from "../src/service-assistant.js";
import { auth, optionalAuth } from "../src/auth.js";
import { guidedAnalysis, analyseWithAI } from "../src/assistant-analysis.js";
import {
  conversationTurn,
  discoveryState,
  indiaDate,
} from "../src/assistant-conversation.js";
import { matchProviders } from "../src/assistant-matching.js";

let tables,
  routes,
  controls,
  customer,
  other,
  provider,
  aiFailure,
  aiInvalid,
  aiInputs,
  env;
const same = (a, b) => String(a) === String(b);
const get = (r, k) => k.split(".").reduce((v, x) => v?.[x], r);
function matches(r, f) {
  return Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((q) => matches(r, q));
    const actual = get(r, k);
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof mongoose.Types.ObjectId) &&
      !(v instanceof Date)
    )
      return Object.entries(v).every(([op, x]) =>
        op === "$in"
          ? (Array.isArray(actual) ? actual : [actual]).some((a) =>
              x.some((b) => same(a, b)),
            )
          : op === "$regex"
            ? new RegExp(x, v.$options || "").test(actual || "")
            : op === "$options"
              ? true
              : op === "$gt"
                ? actual > x
                : false,
      );
    return same(actual, v);
  });
}
function query(value) {
  let result = value;
  const q = {
    then: (...a) => Promise.resolve(result).then(...a),
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: () => q,
    populate: (key) => {
      result = (Array.isArray(result) ? result : []).map((r) => ({
        ...r,
        [key]: tables.get(User).find((u) => same(u._id, r[key])),
      }));
      return q;
    },
  };
  return q;
}
function persistence(model, rows = []) {
  tables.set(model, rows);
  mock.method(model, "find", (f) => query(rows.filter((r) => matches(r, f))));
  mock.method(model, "findOne", (f) => query(rows.find((r) => matches(r, f))));
  mock.method(model, "findById", (id) =>
    query(rows.find((r) => same(r._id, id))),
  );
  mock.method(model, "exists", (f) => query(rows.some((r) => matches(r, f))));
  mock.method(model, "deleteOne", async (f) => {
    const i = rows.findIndex((r) => matches(r, f));
    if (i >= 0) rows.splice(i, 1);
  });
  mock.method(model, "create", async (input) => {
    const doc = new model(input);
    await doc.validate();
    const r = doc.toObject();
    if (
      model === Booking &&
      rows.some(
        (b) =>
          (r.assistantDraft && same(b.assistantDraft, r.assistantDraft)) ||
          (b.active &&
            same(b.provider, r.provider) &&
            b.date === r.date &&
            b.time === r.time),
      )
    )
      throw Object.assign(new Error("Slot conflict"), {
        code: 11000,
        status: 409,
      });
    rows.push(r);
    return r;
  });
}
const account = (role, name) => ({
  _id: new mongoose.Types.ObjectId(),
  name,
  role,
  status: "ACTIVE",
  sessionVersion: 0,
});
const cookie = (u) => memoryCookie(u, tables.get(AuthSession));
async function call(
  method,
  path,
  { body = {}, state, event, user, query: params = {} } = {},
) {
  const handlers = routes.get(method + path),
    req = {
      body: {
        ...body,
        ...(state ? { state } : {}),
        ...(event ? { event } : {}),
      },
      params: { id: body.id },
      query: params,
      method: method.toUpperCase(),
      headers: {
        cookie: user ? cookie(user) : "",
        ...(user ? { "x-gharseva-context": fixtureContext(user) } : {}),
      },
    };
  const output = { status: 200 };
  const res = {
    status(n) {
      output.status = n;
      return this;
    },
    json(data) {
      output.data = JSON.parse(JSON.stringify(data));
      return this;
    },
  };
  try {
    if (handlers.includes(auth)) {
      await new Promise((resolve, reject) =>
        auth(req, res, (e) => (e ? reject(e) : resolve())),
      );
      await new Promise((resolve, reject) =>
        handlers[1](req, res, (e) => (e ? reject(e) : resolve())),
      );
    }
    if (handlers.includes(optionalAuth))
      await new Promise((resolve, reject) =>
        optionalAuth(req, res, (e) => (e ? reject(e) : resolve())),
      );
    await handlers.at(-1)(req, res);
  } catch (e) {
    output.status = e.status || 500;
    output.data = { message: e.message };
  }
  return output;
}
const input = () => ({
  providerId: String(provider._id),
  category: "plumbing",
  date: indiaDate(1),
  time: "09:00",
  address: "123 Test Lane, Satellite, Ahmedabad",
  notes: "Tap leaking",
  displayedPrice: 349,
});
const confirm = (id, user = customer, extra = {}) =>
  call("post", "/api/assistant/drafts/:id/confirm", {
    body: { id, confirm: true, ...extra },
    user,
  });
beforeEach(() => {
  env = { ...process.env };
  Object.assign(process.env, {
    JWT_SECRET: "unit-test-only-long-key",
    ASSISTANT_AI_ENABLED: "false",
    NODE_ENV: "test",
  });
  tables = new Map();
  routes = new Map();
  controls = { bookingEnabled: true };
  aiFailure = false;
  aiInvalid = false;
  aiInputs = [];
  customer = account("customer", "Test Customer");
  other = account("customer", "Other Customer");
  customer.city = other.city = "Ahmedabad";
  provider = account("provider", "Test Professional");
  provider.profile = {
    category: "plumbing",
    categories: ["plumbing", "electrical"],
    city: "Ahmedabad",
    area: "Satellite",
    price: 349,
    status: "APPROVED",
    available: true,
    days: [0, 1, 2, 3, 4, 5, 6],
    slots: ["09:00", "11:00", "14:00"],
    portfolio: [],
  };
  persistence(AuthSession, []);
  mock.method(AuthSession, "updateOne", async (f, u) => {
    const r = tables.get(AuthSession).find((r) => matches(r, f));
    if (r) Object.assign(r, u.$set || {});
    return { modifiedCount: r ? 1 : 0 };
  });
  persistence(User, [customer, other, provider, account("admin", "Admin")]);
  persistence(
    Category,
    ["plumbing", "electrical", "appliance", "cleaning"].map((slug) => ({
      _id: new mongoose.Types.ObjectId(),
      slug,
      name: slug,
      enabled: true,
    })),
  );
  for (const m of [Booking, File, AssistantBookingDraft]) persistence(m);
  mock.method(Settings, "findOneAndUpdate", async () => controls);
  mock.method(Review, "aggregate", async () => []);
  mock.method(Booking, "aggregate", async () => []);
  const app = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (path, ...handlers) =>
          routes.set(method + path, handlers),
    },
  );
  mountAssistant(app, {
    settings: async () => controls,
    publicProviders,
    createCustomerBooking,
    bookingView,
    aiAnalyse: async (messages, categories) => {
      aiInputs.push(messages);
      if (aiFailure) throw new Error("invalid AI");
      return analyseWithAI(messages, categories, async () => ({
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    category: aiInvalid ? "invented" : "plumbing",
                    summary: "Plumbing may help",
                    guidance: "A professional should inspect it.",
                    questions: [],
                    confidence: "medium",
                    urgent: false,
                  }),
                },
              ],
            },
          ],
        }),
      }));
    },
  });
});
afterEach(() => {
  mock.restoreAll();
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
});

test("minimal descriptions and common typos select only enabled services without a questionnaire", () => {
  const cats = tables.get(Category);
  for (const [problem, slug] of [
    ["Tap leaking", "plumbing"],
    ["Tap leeking", "plumbing"],
    ["AC not cooling", "appliance"],
    ["Need someone to clean kitchen", "cleaning"],
    ["Fan making noise", "electrical"],
    ["Wasing machine not draining", "appliance"],
  ]) {
    const r = guidedAnalysis([problem], cats);
    assert.equal(r.category, slug, problem);
    assert.deepEqual(r.questions, []);
  }
  const r = guidedAnalysis(
    ["Need someone to clean kitchen"],
    cats.filter((c) => c.slug !== "cleaning"),
  );
  assert.equal(r.category, null);
  assert.equal(r.unsupported, true);
});
test("ambiguous water asks one focused question with useful choices and no diagnosis", () => {
  const r = guidedAnalysis(["Water on the floor"], tables.get(Category));
  assert.equal(r.category, null);
  assert.equal(r.questions.length, 1);
  assert.equal(r.choices.length, 3);
  assert.match(r.questions[0], /source/);
});
test("hazards stop normal matching and unsupported categories cannot be forced", async () => {
  const r = await call("post", "/api/assistant/conversation", {
    event: { type: "message", value: "Sparks and burning wire" },
  });
  assert.equal(r.data.urgent, true);
  assert.deepEqual(r.data.providers, []);
  assert.equal(
    (
      await call("post", "/api/assistant/conversation", {
        event: { type: "category", value: "not-in-catalog" },
      })
    ).status,
    400,
  );
});
test("conversation remembers city, budget, date and task; corrections invalidate affected choices", async () => {
  let s = { city: "Ahmedabad", budget: 500 };
  const send = async (value) => {
    const r = await call("post", "/api/assistant/conversation", {
      state: s,
      event: { type: "message", value },
    });
    assert.equal(r.status, 200);
    s = r.data.state;
    return r.data;
  };
  let r = await send("Tap leaking");
  assert.equal(s.category, "plumbing");
  assert.equal(s.city, "Ahmedabad");
  assert.match(r.question, /day/);
  await send("Actually tomorrow");
  assert.equal(s.date, indiaDate(1));
  assert.equal(s.problem, "Tap leaking");
  s.providerId = String(provider._id);
  s.time = "09:00";
  await send("Show cheaper options");
  assert.equal(s.sort, "price");
  assert.equal(s.providerId, "");
  assert.equal(s.time, "");
  assert.equal(s.budget, 500);
  await send("Change the city");
  assert.equal(s.city, "");
  assert.match((await send("Ahmedabad")).question, /professional/);
});
test("a combined short task, known city and tomorrow is understood in one turn", async () => {
  const r = await call("post", "/api/assistant/conversation", {
    event: { type: "message", value: "Tap leaking in Ahmedabad tomorrow" },
  });
  assert.equal(r.data.state.category, "plumbing");
  assert.equal(r.data.state.date, indiaDate(1));
  assert.equal(r.data.providers.length, 1);
});
test("matching uses actual approved records, exact area, budget, schedule, occupied slots and platform pause", async () => {
  const date = indiaDate(1);
  tables
    .get(Booking)
    .push({ provider: provider._id, date, time: "09:00", active: true });
  const match = (params) =>
    call("get", "/api/assistant/matches", {
      query: { category: "plumbing", city: "Ahmedabad", date, ...params },
    });
  let r = await match({});
  assert.deepEqual(r.data.providers[0].availability.slots, ["11:00", "14:00"]);
  assert.equal(r.data.providers[0].workImages.length, 0);
  for (const q of [
    { city: "Pune" },
    { area: "Another area" },
    { budget: "300" },
    { time: "09:00" },
  ])
    assert.equal((await match(q)).data.providers.length, 0);
  provider.profile.days = [];
  assert.equal((await match({})).data.providers.length, 0);
  provider.profile.days = [0, 1, 2, 3, 4, 5, 6];
  provider.profile.status = "PENDING";
  assert.equal((await match({})).data.providers.length, 0);
  provider.profile.status = "APPROVED";
  provider.status = "SUSPENDED";
  assert.equal((await match({})).data.providers.length, 0);
  provider.status = "ACTIVE";
  controls.bookingEnabled = false;
  assert.equal((await match({})).data.providers.length, 0);
});
test("matching sorts transparently, returns at most three and never invents slots", () => {
  const base = {
    ...provider.profile,
    _id: provider._id,
    name: provider.name,
    rating: 0,
    reviews: 0,
  };
  const people = [1, 2, 3, 4].map((n) => ({
    ...base,
    _id: String(n),
    price: 100 + n * 100,
    name: "Person " + n,
  }));
  const r = matchProviders(
    people,
    { slug: "plumbing", name: "Plumbing" },
    { date: indiaDate(1), sort: "price" },
    [],
  );
  assert.equal(r.length, 3);
  assert.equal(r[0].price, 200);
  assert.deepEqual(r[0].availability.slots, base.slots);
});
test("forged provider selections and stale occupied appointment selections are revalidated", async () => {
  const state = { category: "plumbing", city: "Pune", date: indiaDate(1) };
  assert.equal(
    (
      await call("post", "/api/assistant/conversation", {
        state,
        event: { type: "provider", value: String(provider._id) },
      })
    ).status,
    409,
  );
  const r = await call("post", "/api/assistant/conversation", {
    state: { ...state, providerId: String(provider._id), time: "09:00" },
    event: { type: "resume" },
  });
  assert.equal(r.data.state.providerId, "");
  assert.equal(r.data.state.time, "");
  assert.deepEqual(r.data.providers, []);
});
test("AI has explicit consent, failure and invalid-output fallbacks; controls/addresses never enter AI", async () => {
  Object.assign(process.env, {
    ASSISTANT_AI_ENABLED: "true",
    OPENAI_API_KEY: "fake-test-only",
  });
  assert.equal(
    (
      await call("post", "/api/assistant/conversation", {
        body: { mode: "ai" },
        event: { type: "message", value: "Tap leak" },
      })
    ).status,
    400,
  );
  aiFailure = true;
  let r = await call("post", "/api/assistant/conversation", {
    body: { mode: "ai", shareWithAI: true },
    event: { type: "message", value: "Tap leak" },
  });
  assert.equal(r.data.mode, "guided");
  assert.match(r.data.notice, /invalid/);
  assert.equal(r.data.state.category, "plumbing");
  aiFailure = false;
  aiInvalid = true;
  r = await call("post", "/api/assistant/conversation", {
    body: { mode: "ai", shareWithAI: true },
    event: { type: "message", value: "Tap leak" },
  });
  assert.equal(r.data.mode, "guided");
  assert.equal(r.data.state.category, "plumbing");
  assert.match(r.data.notice, /invalid/);
  aiInvalid = false;
  r = await call("post", "/api/assistant/conversation", {
    body: {
      mode: "ai",
      shareWithAI: true,
      address: "private address",
      customer: "other",
    },
    event: { type: "message", value: "नल टपक रहा है" },
  });
  assert.equal(r.data.mode, "ai");
  assert.equal(r.data.state.category, "plumbing");
  assert.deepEqual(aiInputs.at(-1), ["नल टपक रहा है"]);
  const count = aiInputs.length;
  await call("post", "/api/assistant/conversation", {
    body: { mode: "ai", shareWithAI: true },
    state: r.data.state,
    event: { type: "message", value: "123 Private Street, phone 9876543210" },
  });
  assert.equal(aiInputs.length, count);
});
test("adapter rejects invalid category, extra tool actions, refusal and malformed output", async () => {
  const response = (data) => async () => ({
    ok: true,
    json: async () => ({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: typeof data === "string" ? data : JSON.stringify(data),
            },
          ],
        },
      ],
    }),
  });
  for (const data of [
    "bad json",
    {
      category: "invented",
      summary: "x",
      guidance: "x",
      questions: [],
      confidence: "high",
      urgent: false,
    },
    {
      category: "plumbing",
      summary: "x",
      guidance: "x",
      questions: [],
      confidence: "high",
      urgent: false,
      action: "book",
    },
  ])
    await assert.rejects(() =>
      analyseWithAI(["tap"], tables.get(Category), response(data)),
    );
  await assert.rejects(() =>
    analyseWithAI(["tap"], tables.get(Category), async () => ({ ok: false })),
  );
});
test("public conversation cannot inject ownership, permissions, prices or draft data", () => {
  assert.throws(
    () => discoveryState(null, tables.get(Category)),
    (e) => e.status === 400,
  );
  assert.throws(
    () => discoveryState([], tables.get(Category)),
    (e) => e.status === 400,
  );
  const s = discoveryState(
    {
      category: "plumbing",
      customer: String(other._id),
      price: 1,
      address: "private",
      confirm: true,
      role: "admin",
    },
    tables.get(Category),
  );
  for (const key of ["customer", "price", "address", "confirm", "role"])
    assert.equal(key in s, false);
});
test("draft preparation requires a current customer session and uses server owner and price", async () => {
  assert.equal(
    (await call("post", "/api/assistant/drafts", { body: input() })).status,
    401,
  );
  for (const u of [provider, tables.get(User).find((u) => u.role === "admin")])
    assert.equal(
      (await call("post", "/api/assistant/drafts", { body: input(), user: u }))
        .status,
      403,
    );
  const r = await call("post", "/api/assistant/drafts", {
    body: { ...input(), customer: other._id, price: 1 },
    user: customer,
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.price, 349);
  assert.equal(tables.get(Booking).length, 0);
  assert.ok(same(tables.get(AssistantBookingDraft)[0].customer, customer._id));
  assert.ok(new Date(r.data.expiresAt) > new Date());
  assert.ok(new Date(r.data.expiresAt) < new Date(Date.now() + 21 * 60000));
});
test("draft confirmation is private, explicit and idempotent even with competing retries", async () => {
  const d = await call("post", "/api/assistant/drafts", {
    body: input(),
    user: customer,
  });
  const id = d.data._id;
  assert.equal((await confirm(id, other)).status, 404);
  assert.equal((await confirm(id, customer, { confirm: false })).status, 400);
  const rs = await Promise.all([confirm(id), confirm(id)]);
  assert.ok(rs.every((r) => [200, 201].includes(r.status)));
  assert.equal(rs[0].data._id, rs[1].data._id);
  assert.equal(tables.get(Booking).length, 1);
  assert.equal(rs[0].data.status, "PENDING");
  assert.equal(
    (
      await confirm(id, customer, {
        price: 1,
        address: "forged",
        customer: other._id,
      })
    ).data.address,
    input().address,
  );
});
test("expired drafts and changed price, suspension, approval, service, controls or occupied slots require review", async () => {
  for (const scenario of [
    "expiry",
    "price",
    "suspension",
    "approval",
    "category",
    "paused",
    "slot",
  ]) {
    provider.status = "ACTIVE";
    provider.profile.price = 349;
    provider.profile.status = "APPROVED";
    controls.bookingEnabled = true;
    tables.get(Category)[0].enabled = true;
    tables.get(Booking).length = 0;
    const d = await call("post", "/api/assistant/drafts", {
      body: input(),
      user: customer,
    });
    assert.equal(d.status, 201);
    if (scenario === "expiry")
      tables.get(AssistantBookingDraft).at(-1).expiresAt = new Date(0);
    if (scenario === "price") provider.profile.price = 499;
    if (scenario === "suspension") provider.status = "SUSPENDED";
    if (scenario === "approval") provider.profile.status = "PENDING";
    if (scenario === "category") tables.get(Category)[0].enabled = false;
    if (scenario === "paused") controls.bookingEnabled = false;
    if (scenario === "slot") await createCustomerBooking(other, input());
    assert.ok(
      [400, 404, 409].includes((await confirm(d.data._id)).status),
      scenario,
    );
    assert.equal(
      tables.get(Booking).filter((b) => same(b.customer, customer._id)).length,
      0,
      scenario,
    );
  }
});
test("changed card estimate cannot silently become a new draft price", async () => {
  provider.profile.price = 499;
  const r = await call("post", "/api/assistant/drafts", {
    body: input(),
    user: customer,
  });
  assert.equal(r.status, 409);
  assert.match(r.data.message, /estimate changed/);
  assert.equal(tables.get(AssistantBookingDraft).length, 0);
});
test("normal bookings share validation and the same active-slot constraint with assistant bookings", async () => {
  const ordinary = await createCustomerBooking(customer, input());
  assert.equal(ordinary.status, "PENDING");
  assert.equal(ordinary.assistantDraft, undefined);
  await assert.rejects(
    () => createCustomerBooking(other, { ...input(), category: "electrical" }),
    (e) => e.code === 11000,
  );
  const indexes = Booking.schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, opts]) =>
        keys.provider &&
        keys.date &&
        keys.time &&
        opts.unique &&
        opts.partialFilterExpression.active,
    ),
  );
  assert.ok(indexes.some(([keys, opts]) => keys.assistantDraft && opts.unique));
});

test("hazard corrections interrupt an existing service and changing trade clears stale notes", async () => {
  const state = {
    category: "plumbing",
    problem: "Tap leaking",
    city: "Ahmedabad",
    date: indiaDate(1),
    providerId: String(provider._id),
    time: "09:00",
  };
  const hazard = await call("post", "/api/assistant/conversation", {
    state,
    event: {
      type: "message",
      value: "Actually there are sparks near the socket",
    },
  });
  assert.equal(hazard.data.urgent, true);
  assert.equal(hazard.data.state.providerId, "");
  assert.equal(hazard.data.state.category, "");
  const changed = await call("post", "/api/assistant/conversation", {
    state,
    event: { type: "category", value: "cleaning" },
  });
  assert.equal(changed.data.state.problem, "");
  assert.equal(changed.data.state.providerId, "");
  const unknown = guidedAnalysis(
    ["Water on the floor", "Source unknown"],
    tables.get(Category),
  );
  assert.deepEqual(unknown.questions, []);
  assert.equal(unknown.category, null);
  const unsupported = guidedAnalysis(["Need a doctor"], tables.get(Category));
  assert.equal(unsupported.unsupported, true);
});

test("another customer cannot delete a draft and a suspended customer cannot confirm it", async () => {
  const d = await call("post", "/api/assistant/drafts", {
    body: input(),
    user: customer,
  });
  await call("delete", "/api/assistant/drafts/:id", {
    body: { id: d.data._id },
    user: other,
  });
  assert.equal(tables.get(AssistantBookingDraft).length, 1);
  customer.status = "SUSPENDED";
  assert.equal((await confirm(d.data._id)).status, 401);
  assert.equal(tables.get(Booking).length, 0);
  customer.status = "ACTIVE";
  await call("delete", "/api/assistant/drafts/:id", {
    body: { id: d.data._id },
    user: customer,
  });
  assert.equal((await confirm(d.data._id)).status, 404);
});

test("a still-eligible selected professional survives changes in ranking", () => {
  const profile = {
    ...provider.profile,
    _id: String(provider._id),
    name: provider.name,
    rating: 0,
    reviews: 0,
  };
  const people = [1, 2, 3]
    .map((n) => ({
      ...profile,
      _id: String(n),
      name: "Higher rated " + n,
      rating: 5,
    }))
    .concat(profile);
  const r = matchProviders(
    people,
    { slug: "plumbing", name: "Plumbing" },
    { date: indiaDate(1), providerId: profile._id },
    [],
  );
  assert.equal(r.length, 3);
  assert.equal(r[0]._id, profile._id);
});
