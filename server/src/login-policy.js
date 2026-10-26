import { fail } from "./domain.js";

export function validateLoginPortal(portal, publicOnly = false) {
  if (
    !(
      publicOnly ? ["customer", "provider"] : ["customer", "provider", "admin"]
    ).includes(portal)
  )
    fail(400, "Choose a valid sign-in page.");
  return portal;
}

export function checkLoginPortal(user, portal, publicOnly = false) {
  validateLoginPortal(portal, publicOnly);
  if ((publicOnly && user.role === "admin") || (portal && user.role !== portal))
    fail(
      403,
      "Use the sign-in page for your account: customer, professional or administrator.",
    );
}

// Login derives authorization from the stored account, never a browser portal.
// The legacy portal helpers remain scoped to explicit recovery/registration flows.
export function checkStoredLoginRole(user, publicOnly = false) {
  if (
    !(
      publicOnly ? ["customer", "provider"] : ["customer", "provider", "admin"]
    ).includes(user?.role)
  )
    fail(
      403,
      publicOnly
        ? "Google and Apple sign-in are available only for customer and professional accounts."
        : "This account cannot sign in. Contact support.",
    );
}

export function hasContactProof(user, channel, demoAllowed) {
  const proof = user?.verification?.[channel];
  return Boolean(
    proof?.at &&
    (proof.mode === "live" || (proof.mode === "demo" && demoAllowed)),
  );
}

export function versionFilter(version) {
  return version === 0
    ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
    : { sessionVersion: version };
}
