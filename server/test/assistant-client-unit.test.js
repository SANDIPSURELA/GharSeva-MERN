import { test } from "node:test";
import assert from "node:assert/strict";
import {
  savePublicSelection,
  takePublicSelection,
  saveDraftReference,
  readDraftReference,
  clearDraftReference,
  publicSelectionKey,
  draftReferenceKey,
  AssistantRequestGate,
} from "../../shared/assistant-client-state.js";
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const owner = "a".repeat(24),
  id = "b".repeat(24);
test("guest continuation keeps a bounded public selection and excludes messages area addresses and account data", () => {
  const store = storage(),
    now = 1000;
  savePublicSelection(
    store,
    {
      category: "plumbing",
      city: "Ahmedabad",
      providerId: id,
      time: "09:00",
      problem: "private description",
      area: "private address",
      address: "secret address",
      notes: "private notes",
      customer: "secret account",
    },
    now,
  );
  const raw = store.getItem(publicSelectionKey);
  for (const value of [
    "private",
    "secret",
    "address",
    "notes",
    "problem",
    "customer",
  ])
    assert.ok(!raw.includes(value));
  assert.equal(takePublicSelection(store, "Ahmedabad", now).providerId, id);
  assert.equal(takePublicSelection(store, "Ahmedabad", now), null);
});
test("a different saved city clears guest provider/time and an expired public selection is never restored", () => {
  const store = storage();
  savePublicSelection(
    store,
    { city: "Ahmedabad", category: "plumbing", providerId: id, time: "09:00" },
    1000,
  );
  const result = takePublicSelection(store, "Pune", 1000);
  assert.equal(result.city, "Pune");
  assert.equal(result.providerId, "");
  assert.equal(result.time, "");
  savePublicSelection(store, { city: "Ahmedabad" }, 1000);
  assert.equal(takePublicSelection(store, "Ahmedabad", 1201001), null);
});
test("prepared reference contains no private details, is owner-bound and expires even without storage cleanup", () => {
  const store = storage(),
    draft = {
      _id: id,
      expiresAt: new Date(1000 + 1200000).toISOString(),
      address: "private address",
      notes: "secret",
    };
  saveDraftReference(store, owner, draft, true, 1000);
  const raw = store.getItem(draftReferenceKey);
  assert.ok(
    !raw.includes("private") &&
      !raw.includes("address") &&
      !raw.includes("notes"),
  );
  assert.equal(readDraftReference(store, owner, 1000).pending, true);
  assert.equal(readDraftReference(store, "c".repeat(24), 1000), null);
  saveDraftReference(store, owner, draft, false, 1000);
  assert.equal(readDraftReference(store, owner, 1201000), null);
});
test("malformed forged and unbounded references do not become resume authorization", () => {
  const store = storage();
  for (const ref of [
    { owner, id, expiresAt: "invalid" },
    { owner, id: "wrong", expiresAt: 2000 },
    { owner, id, expiresAt: 999999999 },
  ]) {
    store.setItem(draftReferenceKey, JSON.stringify(ref));
    assert.equal(readDraftReference(store, owner, 1000), null);
  }
  const blocked = {
    getItem: () => {
      throw Error("storage blocked");
    },
    setItem: () => {
      throw Error("storage blocked");
    },
    removeItem: () => {
      throw Error("storage blocked");
    },
  };
  assert.doesNotThrow(() =>
    savePublicSelection(blocked, { city: "Ahmedabad" }),
  );
  assert.equal(readDraftReference(blocked, owner), null);
});
test("clearing one prepared request cannot discard a different newer reference", () => {
  const store = storage();
  saveDraftReference(
    store,
    owner,
    { _id: id, expiresAt: new Date(Date.now() + 60000) },
    false,
  );
  clearDraftReference(store, "c".repeat(24));
  assert.equal(readDraftReference(store, owner).id, id);
  clearDraftReference(store, id);
  assert.equal(readDraftReference(store, owner), null);
});
test("late discovery/resume responses are invalidated by newer selections or unmount", () => {
  const gate = new AssistantRequestGate(),
    old = gate.begin(),
    fresh = gate.begin();
  assert.equal(gate.valid(old), false);
  assert.equal(gate.valid(fresh), true);
  gate.invalidate();
  assert.equal(gate.valid(fresh), false);
});
