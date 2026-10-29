export const publicSelectionKey = "gs_assistant_public_selection";
export const draftReferenceKey = "gs_assistant_prepared_reference";
const objectId = (value) =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
export function savePublicSelection(storage, state, now = Date.now()) {
  const selection = Object.fromEntries(
    ["category", "city", "date", "time", "providerId", "sort", "budget"]
      .filter((k) => state[k] !== undefined)
      .map((k) => [k, state[k]]),
  );
  try {
    storage.setItem(
      publicSelectionKey,
      JSON.stringify({ selection, expiresAt: now + 20 * 60000 }),
    );
  } catch {}
}
export function takePublicSelection(storage, city, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(publicSelectionKey) || "null");
    storage.removeItem(publicSelectionKey);
    if (
      !value ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + 20 * 60000 ||
      typeof value.selection !== "object"
    )
      return null;
    const allowed = Object.fromEntries(
      ["category", "city", "date", "time", "providerId", "sort", "budget"]
        .filter((k) => value.selection[k] !== undefined)
        .map((k) => [k, value.selection[k]]),
    );
    return {
      ...allowed,
      ...(city && allowed.city !== city
        ? { city, providerId: "", time: "" }
        : {}),
    };
  } catch {
    return null;
  }
}
export function saveDraftReference(
  storage,
  owner,
  draft,
  pending = false,
  now = Date.now(),
) {
  if (!objectId(owner) || !objectId(String(draft._id))) return;
  const expiresAt = Math.min(
    new Date(draft.expiresAt).getTime(),
    now + 20 * 60000,
  );
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
  try {
    storage.setItem(
      draftReferenceKey,
      JSON.stringify({
        owner,
        id: String(draft._id),
        expiresAt,
        pending: pending === true,
      }),
    );
  } catch {}
}
export function readDraftReference(storage, owner, now = Date.now()) {
  try {
    const ref = JSON.parse(storage.getItem(draftReferenceKey) || "null");
    if (
      !ref ||
      !Number.isFinite(ref.expiresAt) ||
      ref.owner !== owner ||
      !objectId(ref.owner) ||
      !objectId(ref.id) ||
      ref.expiresAt <= now ||
      ref.expiresAt > now + 20 * 60000
    ) {
      storage.removeItem(draftReferenceKey);
      return null;
    }
    return {
      owner: ref.owner,
      id: ref.id,
      expiresAt: ref.expiresAt,
      pending: ref.pending === true,
    };
  } catch {
    return null;
  }
}
export function clearDraftReference(storage, id) {
  try {
    const ref = JSON.parse(storage.getItem(draftReferenceKey) || "null");
    if (!id || ref?.id === String(id)) storage.removeItem(draftReferenceKey);
  } catch {}
}
export class AssistantRequestGate {
  constructor() {
    this.generation = 0;
  }
  begin() {
    return ++this.generation;
  }
  valid(value) {
    return value === this.generation;
  }
  invalidate() {
    this.generation++;
  }
}
