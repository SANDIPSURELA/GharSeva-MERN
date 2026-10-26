import { sessionFetch } from "./session-fixture.js";
import { fixtureLogin } from "./login-fixture.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { User } from "../src/models.js";

let db, server, base;
const details = {
  name: "New Customer",
  email: "new.customer@example.com",
  mobile: "9876543210",
  password: "Customer123!",
  terms: true,
  role: "customer",
  city: "Ahmedabad",
};
async function call(path, body, cookie) {
  const response = await sessionFetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "X-GharSeva": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  process.env.AUTH_DELIVERY_MODE = "test";
  process.env.GHARSEVA_DEMO = "true";
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  db = await MongoMemoryServer.create({
    binary: { version: "7.0.24" },
    instance: {
      args: [
        ...(process.platform === "win32" ? [] : ["--nounixsocket"]),
        "--setParameter",
        "diagnosticDataCollectionEnabled=false",
      ],
    },
  });
  await mongoose.connect(db.getUri());
  await User.init();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
});

test("customer signup with selected city persists a hashed password and starts a usable session", async () => {
  const result = await call("/auth/register", {
    ...details,
    status: "SUSPENDED",
    emailVerified: true,
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.role, "customer");
  assert.equal(result.data.status, "ACTIVE");
  assert.equal(result.data.name, details.name);
  assert.equal(result.data.email, details.email);
  assert.equal(result.data.mobile, details.mobile);
  assert.equal(result.data.city, details.city);
  assert.equal(result.data.passwordHash, undefined);
  assert.equal(result.data.emailVerified, undefined);
  assert.ok(result.cookie);
  const saved = await User.findOne({ email: details.email }).select(
    "+passwordHash",
  );
  assert.ok(await bcrypt.compare(details.password, saved.passwordHash));
  assert.equal(
    (await call("/auth/me", undefined, result.cookie)).data._id,
    String(saved._id),
  );
  for (const identifier of [details.email, details.mobile]) {
    const login = await fixtureLogin(base, {
      identifier,
      password: details.password,
    });
    assert.equal(login.status, 200);
    assert.equal(login.data._id, String(saved._id));
  }
});

test("duplicate customer contacts cannot replace an existing account", async () => {
  const saved = await User.findOne({ email: details.email });
  for (const body of [
    { ...details, mobile: "9876543211" },
    { ...details, email: "different@example.com" },
  ]) {
    const result = await call("/auth/register", body);
    assert.equal(result.status, 409);
    assert.equal(result.cookie, undefined);
  }
  assert.equal(await User.countDocuments(), 1);
  assert.equal(
    String((await User.findOne({ email: details.email }))._id),
    String(saved._id),
  );
});

test("invalid customer registrations create no account or session", async () => {
  for (const override of [
    { city: "" },
    { city: "Unknown city" },
    { terms: false },
    { password: "weak" },
    { mobile: "12345" },
    { email: "invalid" },
    { role: "admin" },
  ]) {
    const result = await call("/auth/register", {
      ...details,
      email: "invalid-test@example.com",
      mobile: "9876543212",
      ...override,
    });
    assert.equal(result.status, 400);
    assert.equal(result.cookie, undefined);
  }
  assert.equal(await User.countDocuments(), 1);
});
