// Mocked Admin trust boundary except explicit real-SDK unsigned-token rejection. No OAuth or provider calls.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { socialReadiness } from "../src/social-readiness.js";
import { createExternalVerifier } from "../src/firebase-identity.js";
import {
  identityOptions,
  validateIdentityEnvironment,
} from "../src/identity-services.js";
import { inspectEnvironment } from "../src/deployment.js";
const original = { ...process.env };
afterEach(() => {
  for (const k of Object.keys(process.env))
    if (!(k in original)) delete process.env[k];
  Object.assign(process.env, original);
});
const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;
const config = () => ({
  NODE_ENV: "test",
  AUTH_DELIVERY_MODE: "live",
  GHARSEVA_DEMO: "false",
  AUTH_GOOGLE_ENABLED: "true",
  AUTH_APPLE_ENABLED: "true",
  FIREBASE_PROJECT_ID: "fixture-project",
  FIREBASE_WEB_API_KEY: "AIza" + "x".repeat(35),
  FIREBASE_AUTH_DOMAIN: "fixture-project.firebaseapp.com",
  FIREBASE_CLIENT_EMAIL: "fixture@fixture-project.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: privateKey,
});
const claims = (provider = "google.com") => ({
  uid: "fixture-uid",
  sub: "fixture-uid",
  aud: "fixture-project",
  iss: "https://securetoken.google.com/fixture-project",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  auth_time: Math.floor(Date.now() / 1000),
  email: "fixture@example.test",
  email_verified: true,
  firebase: { sign_in_provider: provider },
});
function verifier(result = claims(), env = config(), extra = {}) {
  const calls = [];
  const verify = createExternalVerifier({
    environment: () => env,
    adminLoader: async () => ({
      getApps: () => [],
      initializeApp: () => ({
        options: { projectId: env.FIREBASE_PROJECT_ID },
      }),
      cert: (value) => {
        assert.ok(value.privateKey);
        return {};
      },
      getAuth: () => ({
        verifyIdToken: async (token, revoked) => {
          calls.push({ token, revoked });
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    }),
    ...extra,
  });
  return { verify, calls };
}
test("Google uses revocation-checked Admin ID tokens and trusted provider claims", async () => {
  for (const provider of ["google"]) {
    const f = verifier(claims(provider + ".com"));
    const result = await f.verify("fixture-firebase-id-token", provider);
    assert.equal(result.provider, provider + ".com");
    assert.equal(result.uid, "fixture-uid");
    assert.deepEqual(f.calls, [
      { token: "fixture-firebase-id-token", revoked: true },
    ]);
  }
});
test("wrong project/issuer/subject, expiry, tenant, sign-in provider and unverified claims cannot authenticate", async () => {
  for (const change of [
    { aud: "other-project" },
    { iss: "https://securetoken.google.com/other" },
    { sub: "other" },
    { exp: 0 },
    { iat: Date.now() / 1000 + 500 },
    { email_verified: false },
    { email_verified: "true" },
    { email: "" },
    { uid: "" },
    { auth_time: 0 },
    { firebase: { sign_in_provider: "password" } },
    { firebase: { sign_in_provider: "google.com", tenant: "other-tenant" } },
  ]) {
    await assert.rejects(() =>
      verifier({ ...claims(), ...change }).verify("fixture", "google"),
    );
  }
  await assert.rejects(
    () => verifier(claims("apple.com")).verify("fixture", "google"),
    /not enabled/,
  );
});
test("malformed input and disabled provider fail before SDK loading; providers are independent", async () => {
  const env = { ...config(), AUTH_APPLE_ENABLED: "false" };
  let loaded = 0;
  const f = verifier(claims(), env, {
    adminLoader: async () => {
      loaded++;
      throw Error("must not load");
    },
  });
  for (const token of ["", null, "x".repeat(10001)])
    await assert.rejects(() => f.verify(token, "google"));
  await assert.rejects(
    () => f.verify("fixture", "apple"),
    (e) => e.status === 400,
  );
  assert.equal(loaded, 0);
  assert.equal(socialReadiness(env).google.configured, true);
  assert.equal(socialReadiness(env).apple.configured, false);
  Object.assign(process.env, env);
  assert.equal(identityOptions().google, true);
  assert.equal(identityOptions().apple, false);
  const publicOptions = JSON.stringify(identityOptions());
  assert.ok(!publicOptions.includes(privateKey));
  assert.ok(!publicOptions.includes(env.FIREBASE_CLIENT_EMAIL));
});
test("local readiness rejects malformed public/Admin configuration and never exposes private values", () => {
  for (const change of [
    { FIREBASE_PROJECT_ID: "invalid project" },
    { FIREBASE_AUTH_DOMAIN: "https://fixture.example.test/path" },
    { FIREBASE_WEB_API_KEY: "placeholder" },
    { FIREBASE_PRIVATE_KEY: "not a pem" },
    { FIREBASE_CLIENT_EMAIL: "not-an-email" },
    { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" },
  ]) {
    const result = socialReadiness({ ...config(), ...change });
    assert.equal(result.ready, false);
    assert.ok(!JSON.stringify(result).includes(privateKey));
  }
  const env = {
    ...config(),
    FIREBASE_PRIVATE_KEY: privateKey.replaceAll("\n", "\\n"),
  };
  assert.equal(socialReadiness(env).ready, true);
});
test("service-account JSON must be readable, valid and match the configured Firebase project", () => {
  mkdirSync(".test-tmp", { recursive: true });
  const file = ".test-tmp/social-service-account.fixture.json";
  const env = {
    ...config(),
    FIREBASE_PRIVATE_KEY: "",
    FIREBASE_CLIENT_EMAIL: "",
    GOOGLE_APPLICATION_CREDENTIALS: file,
  };
  try {
    writeFileSync(
      file,
      JSON.stringify({
        type: "service_account",
        project_id: "fixture-project",
        client_email: config().FIREBASE_CLIENT_EMAIL,
        private_key: privateKey,
      }),
    );
    assert.equal(socialReadiness(env).ready, true);
    writeFileSync(
      file,
      JSON.stringify({
        type: "service_account",
        project_id: "other",
        private_key: privateKey,
      }),
    );
    assert.equal(socialReadiness(env).ready, false);
    writeFileSync(file, "invalid json");
    assert.equal(socialReadiness(env).ready, false);
  } finally {
    unlinkSync(file);
  }
  assert.equal(socialReadiness(env).ready, false);
});
test("timeout/network errors stay unavailable; invalid/revoked/expired credentials fail safely", async () => {
  const timed = verifier(claims(), config(), {
    timeoutMs: 5,
    adminLoader: async () => ({
      getApps: () => [],
      initializeApp: () => ({}),
      cert: () => ({}),
      getAuth: () => ({ verifyIdToken: () => new Promise(() => {}) }),
    }),
  });
  await assert.rejects(
    () => timed.verify("fixture", "google"),
    (e) => e.status === 503 && !e.message.includes("private"),
  );
  for (const code of [
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/invalid-id-token",
    "app/network-error",
  ]) {
    await assert.rejects(
      () =>
        verifier(
          Object.assign(Error("private provider response"), { code }),
        ).verify("fixture", "google"),
      (e) => !e.message.includes("private"),
    );
  }
});
test("retired Apple sign-in is rejected even if old settings remain enabled", async () => {
  const f = verifier(claims("apple.com"));
  await assert.rejects(
    () => f.verify("fixture", "apple"),
    (e) => e.status === 400,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(socialReadiness(config()).apple.configured, false);
});

test("production emulator fails closed while incomplete optional provider setup does not disable password login", () => {
  Object.assign(process.env, config(), {
    NODE_ENV: "production",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  });
  assert.throws(validateIdentityEnvironment, /emulator/);
  const env = {
    ...config(),
    NODE_ENV: "production",
    JWT_SECRET: "fixture-with-at-least-thirty-two-characters",
    IDENTITY_STORAGE_KEY: "0123456789abcdef".repeat(4),
    MONGODB_URI: "mongodb://127.0.0.1/gharseva_test_fixture",
    CLIENT_ORIGIN: "https://fixture.example.test",
    PAYMENTS_MODE: "disabled",
    FIREBASE_PRIVATE_KEY: "bad",
  };
  const report = inspectEnvironment(env, { requireBuild: false });
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((v) => v.includes("social")));
  assert.ok(
    inspectEnvironment(
      { ...env, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" },
      { requireBuild: false },
    ).errors.some((v) => v.includes("emulator")),
  );
});
test("real Firebase Admin SDK rejects unsigned/malformed ID tokens, without emulator or an acceptance bypass", async () => {
  const appSdk = await import("firebase-admin/app");
  const authSdk = await import("firebase-admin/auth");
  const app = appSdk.initializeApp(
    {
      projectId: "fixture-project",
      credential: appSdk.cert({
        projectId: "fixture-project",
        clientEmail: config().FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    },
    "social-unsigned-unit",
  );
  const verify = createExternalVerifier({
    environment: config,
    adminLoader: async () => ({
      ...appSdk,
      ...authSdk,
      getApps: () => [],
      initializeApp: () => app,
    }),
  });
  try {
    const unsigned =
      Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify(claims())).toString("base64url") +
      ".";
    for (const token of ["not-a-jwt", unsigned])
      await assert.rejects(
        () => verify(token, "google"),
        (e) => e.status === 401,
      );
  } finally {
    await appSdk.deleteApp(app);
  }
});
test("strict provider diagnostics are independent, truthful, offline and secret-free", () => {
  for (const [args, override, status] of [
    [["--google-ready"], { AUTH_APPLE_ENABLED: "false" }, 0],
    [["--apple-ready"], { AUTH_APPLE_ENABLED: "false" }, 1],
    [["--google-ready"], { FIREBASE_PRIVATE_KEY: "bad" }, 1],
  ]) {
    const run = spawnSync(
      process.execPath,
      ["scripts/check-integrations.js", ...args],
      {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, ...config(), ...override },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, status, run.stderr);
    assert.ok(!run.stdout.includes(privateKey));
    assert.ok(!run.stdout.includes(config().FIREBASE_CLIENT_EMAIL));
    if (status) assert.match(run.stderr, /Configuration only; no OAuth/);
  }
});
