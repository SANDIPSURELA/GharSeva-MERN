import { fail, email } from "./domain.js";
import { socialReadiness, firebaseCredential } from "./social-readiness.js";
const loadAdmin = async () => {
  const [app, auth] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
  ]);
  return { ...app, ...auth };
};
// Only call with claims returned by Admin verifyIdToken, never a decoded browser JWT.
export function externalIdentityFromClaims(claims, options, expectedProvider) {
  const now = Date.now() / 1000,
    provider = claims?.firebase?.sign_in_provider;
  if (
    !["google.com", "apple.com"].includes(provider) ||
    !(provider === "google.com" ? options?.google : options?.apple)
  )
    fail(403, "This sign-in provider is not enabled.");
  if (expectedProvider && provider !== expectedProvider + ".com")
    fail(401, "The verified identity does not match the selected provider.");
  const project = options?.firebaseProjectId;
  if (
    project &&
    (claims.aud !== project ||
      claims.iss !== "https://securetoken.google.com/" + project ||
      claims.sub !== claims.uid ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60 ||
      claims.firebase?.tenant)
  )
    fail(401, "External sign-in could not be verified for this project.");
  if (claims.email_verified !== true || !claims.email)
    fail(400, "Use an external account with a verified email address.");
  if (
    typeof claims.uid !== "string" ||
    !claims.uid ||
    claims.uid.length > 128 ||
    !Number.isFinite(claims.auth_time) ||
    now - claims.auth_time > 600 ||
    claims.auth_time > now + 60
  )
    fail(401, "Sign in again to confirm your identity.");
  return {
    uid: claims.uid,
    provider,
    contact: email(claims.email),
    name: typeof claims.name === "string" ? claims.name.slice(0, 80) : "",
  };
}
export function createExternalVerifier({
  environment = () => process.env,
  adminLoader = loadAdmin,
  timeoutMs = 15000,
} = {}) {
  let app;
  return async (idToken, expectedProvider) => {
    if (
      typeof idToken !== "string" ||
      !idToken ||
      idToken.length > 10000 ||
      (expectedProvider !== undefined &&
        !["google", "apple"].includes(expectedProvider))
    )
      fail(400, "Choose a valid external sign-in method.");
    const env = environment(),
      readiness = socialReadiness(env);
    const options = {
      google: readiness.google.configured,
      apple: readiness.apple.configured,
      firebaseProjectId: env.FIREBASE_PROJECT_ID,
    };
    if (
      (!options.google && !options.apple) ||
      (expectedProvider && !options[expectedProvider])
    )
      fail(
        503,
        "This external sign-in provider needs setup. Use an available sign-in method or contact support.",
      );
    let verifier;
    try {
      const sdk = await adminLoader();
      if (!app)
        app =
          sdk.getApps().find((a) => a.name === "gharseva-identity") ||
          sdk.initializeApp(
            {
              projectId: env.FIREBASE_PROJECT_ID,
              credential: sdk.cert(firebaseCredential(env)),
            },
            "gharseva-identity",
          );
      if (
        app.options?.projectId &&
        app.options.projectId !== env.FIREBASE_PROJECT_ID
      )
        throw Error("Verifier project changed; restart required.");
      verifier = sdk.getAuth(app);
    } catch {
      fail(
        503,
        "External identity verification needs server setup. Contact support.",
      );
    }
    let claims, timer;
    try {
      claims = await Promise.race([
        verifier.verifyIdToken(idToken, true),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("verification timeout")),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (
        error.message === "verification timeout" ||
        ["app/network-error", "auth/internal-error"].includes(error.code)
      )
        fail(
          503,
          "The identity service is temporarily unavailable. Try again later.",
        );
      fail(
        401,
        "External sign-in could not be verified. Sign in again or try later.",
      );
    } finally {
      clearTimeout(timer);
    }
    return externalIdentityFromClaims(claims, options, expectedProvider);
  };
}
export const verifyExternal = createExternalVerifier();
