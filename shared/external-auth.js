// Firebase state is temporary. MongoDB accounts and HttpOnly app sessions remain authoritative.
export function externalSignInMessage(error) {
  const messages = {
    "auth/popup-blocked":
      "Your browser blocked sign-in. Allow popups for this site and select the provider again, or use an available password sign-in.",
    "auth/popup-closed-by-user":
      "Sign-in was cancelled. Select a method when you are ready.",
    "auth/cancelled-popup-request":
      "Another sign-in window replaced this request. Finish that window or try again.",
    "auth/unauthorized-domain":
      "This website needs authorised-domain setup for social sign-in. Contact support.",
    "auth/operation-not-allowed":
      "This provider needs account setup. Use an available method or contact support.",
    "auth/account-exists-with-different-credential":
      "Use your existing sign-in first. Then explicitly link another method in Account settings.",
    "auth/network-request-failed":
      "The sign-in service could not be reached. Check your connection and try again.",
    "auth/user-token-expired": "Sign-in expired. Select the provider again.",
    "auth/invalid-credential":
      "The provider identity could not be verified. Select the provider again.",
    "auth/user-disabled": "This sign-in is unavailable. Contact support.",
    "auth/too-many-requests":
      "Too many sign-in requests. Wait before trying again.",
  };
  return (
    messages[error?.code] ||
    (error?.code?.startsWith("auth/")
      ? "Social sign-in could not finish. Try an available method or contact support."
      : error?.message || "Sign-in could not finish.")
  );
}
const defaultLoader = async () =>
  Promise.all([import("firebase/app"), import("firebase/auth")]);
let generation = 0,
  operation = false,
  activeAuth;
function enabled(options, provider) {
  if (
    !["google", "apple"].includes(provider) ||
    !options?.[provider] ||
    !options.firebase
  )
    throw Error("This sign-in provider needs configuration.");
}
async function setup(options, loadSdk) {
  const [{ initializeApp, getApps }, sdk] = await loadSdk();
  const app =
    getApps().find((a) => a.name === "gharseva-identity") ||
    initializeApp(options.firebase, "gharseva-identity");
  if (
    app.options &&
    ["projectId", "authDomain", "apiKey"].some(
      (k) => app.options[k] !== options.firebase[k],
    )
  )
    throw Error(
      "Sign-in settings changed. Reload this page before continuing.",
    );
  const auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.inMemoryPersistence);
  activeAuth = { sdk, auth };
  return activeAuth;
}
export async function prepareExternalAuth(options, loadSdk = defaultLoader) {
  if ((!options?.google && !options?.apple) || !options.firebase) return;
  await setup(options, loadSdk);
}
export async function clearExternalIdentity() {
  generation++;
  const active = activeAuth;
  if (active) await active.sdk.signOut(active.auth).catch(() => {});
}
export async function externalToken(
  options,
  provider,
  loadSdk = defaultLoader,
) {
  enabled(options, provider);
  if (operation) throw Error("A social sign-in is already in progress.");
  operation = true;
  const started = generation;
  let connection, token;
  try {
    connection = await setup(options, loadSdk);
    if (started !== generation)
      throw Error("Sign-in was cancelled because the session changed.");
    const { sdk, auth } = connection;
    const method =
      provider === "google"
        ? new sdk.GoogleAuthProvider()
        : new sdk.OAuthProvider("apple.com");
    if (provider === "google")
      method.setCustomParameters({ prompt: "select_account" });
    else {
      method.addScope("email");
      method.addScope("name");
    }
    const result = await sdk.signInWithPopup(auth, method);
    token = await result.user.getIdToken(true);
    if (started !== generation)
      throw Error("Sign-in was cancelled because the session changed.");
  } finally {
    if (connection)
      await connection.sdk.signOut(connection.auth).catch(() => {});
    operation = false;
  }
  if (started !== generation)
    throw Error("Sign-in was cancelled because the session changed.");
  return token;
}
// Compatibility utility only: UI does not initiate redirects or offer an orphan recovery action.
export async function recoverExternalToken(options, loadSdk = defaultLoader) {
  if ((!options?.google && !options?.apple) || !options.firebase)
    throw Error("External sign-in needs configuration.");
  if (operation) throw Error("A social sign-in is already in progress.");
  operation = true;
  const started = generation;
  let connection;
  try {
    connection = await setup(options, loadSdk);
    const result = await connection.sdk.getRedirectResult(connection.auth);
    const token = result ? await result.user.getIdToken(true) : null;
    if (started !== generation)
      throw Error("Sign-in was cancelled because the session changed.");
    return token;
  } finally {
    if (connection)
      await connection.sdk.signOut(connection.auth).catch(() => {});
    operation = false;
  }
}
export async function exchangeExternalIdentity({
  options,
  provider,
  request,
  details = {},
  active = () => true,
  token = externalToken,
}) {
  const idToken = await token(options, provider);
  if (!active()) throw Error("The session changed. Sign in again.");
  return request("/auth/external", {
    method: "POST",
    body: { ...details, idToken, provider },
  });
}
