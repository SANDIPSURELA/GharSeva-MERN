import { test } from "node:test";
import assert from "node:assert/strict";
import {
  externalToken,
  externalSignInMessage,
} from "../../shared/external-auth.js";
function fixture(outcome) {
  const events = [],
    methods = [];
  class Provider {
    constructor(id = "google.com") {
      this.id = id;
      this.scopes = [];
      methods.push(this);
    }
    addScope(s) {
      this.scopes.push(s);
    }
    setCustomParameters(p) {
      this.parameters = p;
    }
  }
  const sdk = {
    getAuth: () => ({}),
    inMemoryPersistence: "MEMORY",
    setPersistence: async (_, mode) => events.push(mode),
    GoogleAuthProvider: Provider,
    OAuthProvider: Provider,
    signInWithPopup: async () => {
      events.push("popup");
      if (outcome) throw Object.assign(Error("cancelled"), { code: outcome });
      return {
        user: {
          getIdToken: async (force) => {
            assert.equal(force, true);
            events.push("token");
            return "mock-identity-token";
          },
        },
      };
    },
    signOut: async () => events.push("signout"),
  };
  const loader = async () => [
    { getApps: () => [], initializeApp: () => ({}) },
    sdk,
  ];
  return { events, methods, loader };
}
const options = {
  google: true,
  apple: true,
  firebase: { projectId: "fixture" },
};
test("Google and Apple popup adapters use memory persistence, recent token and cleanup without an extra application OTP", async () => {
  for (const provider of ["google", "apple"]) {
    const f = fixture();
    assert.equal(
      await externalToken(options, provider, f.loader),
      "mock-identity-token",
    );
    assert.deepEqual(f.events, ["MEMORY", "popup", "token", "signout"]);
    if (provider === "apple")
      assert.deepEqual(f.methods[0].scopes, ["email", "name"]);
    else
      assert.deepEqual(f.methods[0].parameters, { prompt: "select_account" });
  }
});
test("blocked/cancelled popup cleans Firebase state and returns an actionable message", async () => {
  for (const code of [
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
  ]) {
    const f = fixture(code);
    await assert.rejects(
      () => externalToken(options, "google", f.loader),
      (e) => e.code === code,
    );
    assert.deepEqual(f.events, ["MEMORY", "popup", "signout"]);
    assert.ok(externalSignInMessage({ code }).length > 20);
  }
});
test("disabled or forged providers cannot launch external authentication", async () => {
  for (const [o, p] of [
    [options, "admin"],
    [{ ...options, apple: false }, "apple"],
    [{ google: true }, "google"],
  ]) {
    let loaded = false;
    await assert.rejects(() =>
      externalToken(o, p, async () => {
        loaded = true;
      }),
    );
    assert.equal(loaded, false);
  }
});
test("domain, account conflict and network errors explain setup without exposing provider internals", () => {
  for (const code of [
    "auth/unauthorized-domain",
    "auth/account-exists-with-different-credential",
    "auth/network-request-failed",
    "auth/internal-error",
  ])
    assert.ok(
      !externalSignInMessage({
        code,
        message: "private provider response",
      }).includes("private"),
    );
});

test("redirect recovery handles no pending result and repeated consumed callbacks without inventing authentication", async () => {
  const { recoverExternalToken } =
    await import("../../shared/external-auth.js");
  const f = fixture();
  const modules = await f.loader();
  let calls = 0;
  modules[1].getRedirectResult = async () =>
    ++calls === 1
      ? { user: { getIdToken: async () => "mock-redirect-token" } }
      : null;
  assert.equal(
    await recoverExternalToken(options, async () => modules),
    "mock-redirect-token",
  );
  assert.equal(await recoverExternalToken(options, async () => modules), null);
  assert.deepEqual(f.events, ["MEMORY", "signout", "MEMORY", "signout"]);
});
test("redirect recovery errors clean up and cannot be mistaken for a verified application login", async () => {
  const { recoverExternalToken } =
    await import("../../shared/external-auth.js");
  const f = fixture(),
    modules = await f.loader();
  modules[1].getRedirectResult = async () => {
    throw Object.assign(Error("blocked"), {
      code: "auth/network-request-failed",
    });
  };
  await assert.rejects(
    () => recoverExternalToken(options, async () => modules),
    (e) => e.code === "auth/network-request-failed",
  );
  assert.deepEqual(f.events, ["MEMORY", "signout"]);
});

test("explicit logout cancels a pending popup before an application exchange", async () => {
  const { clearExternalIdentity } =
    await import("../../shared/external-auth.js");
  const f = fixture(),
    modules = await f.loader();
  let complete;
  modules[1].signInWithPopup = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const promise = externalToken(options, "google", async () => modules);
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  await clearExternalIdentity();
  complete({ user: { getIdToken: async () => "must-not-exchange" } });
  await assert.rejects(() => promise, /session changed/);
});
test("duplicate requests cannot launch simultaneous provider popups", async () => {
  const f = fixture(),
    modules = await f.loader();
  let complete,
    calls = 0;
  modules[1].signInWithPopup = () => {
    calls++;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  const first = externalToken(options, "google", async () => modules);
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    () => externalToken(options, "apple", async () => modules),
    /already in progress/,
  );
  complete({ user: { getIdToken: async () => "fixture" } });
  assert.equal(await first, "fixture");
  assert.equal(calls, 1);
});
test("preparation never signs in; a stale application session prevents any exchange", async () => {
  const { prepareExternalAuth, exchangeExternalIdentity } =
    await import("../../shared/external-auth.js");
  const f = fixture();
  await prepareExternalAuth(options, f.loader);
  assert.deepEqual(f.events, ["MEMORY"]);
  let requested = 0;
  await assert.rejects(
    () =>
      exchangeExternalIdentity({
        options,
        provider: "google",
        request: async () => {
          requested++;
        },
        token: async () => "fixture",
        active: () => false,
      }),
    /session changed/,
  );
  assert.equal(requested, 0);
  const result = await exchangeExternalIdentity({
    options,
    provider: "apple",
    details: { action: "login", idToken: "forged", provider: "google" },
    token: async () => "verified-boundary-fixture",
    request: async (path, request) => ({ path, body: request.body }),
  });
  assert.deepEqual(result, {
    path: "/auth/external",
    body: {
      action: "login",
      idToken: "verified-boundary-fixture",
      provider: "apple",
    },
  });
});
