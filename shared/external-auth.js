// Firebase credentials remain in memory and are cleared even after cancellation.
// This integration uses popups; it never silently redirects or links by email.
export function externalSignInMessage(error) {
  const messages = {
    "auth/popup-blocked":
      "Your browser blocked sign-in. Allow popups for this site, then select Google or Apple again. You can also use your GharSeva password.",
    "auth/popup-closed-by-user":
      "Sign-in was cancelled. Select a sign-in method when you are ready.",
    "auth/cancelled-popup-request":
      "Another sign-in window replaced this request. Complete that window or try again.",
    "auth/unauthorized-domain":
      "This website is not an authorised Firebase sign-in domain. The project owner must finish domain setup.",
    "auth/operation-not-allowed":
      "This sign-in provider is not enabled in Firebase. Contact the project owner.",
    "auth/account-exists-with-different-credential":
      "An account already uses this email. Complete its existing sign-in, then link the new method in Account settings.",
    "auth/network-request-failed":
      "The sign-in service could not be reached. Check your connection and try again.",
  };
  return (
    messages[error?.code] ||
    (error?.code?.startsWith("auth/")
      ? "External sign-in could not finish. Try again or use your password."
      : error?.message || "Sign-in could not finish.")
  );
}
const defaultLoader = async () =>
  Promise.all([import("firebase/app"), import("firebase/auth")]);
export async function externalToken(
  options,
  provider,
  loadSdk = defaultLoader,
) {
  if (
    !["google", "apple"].includes(provider) ||
    !options?.[provider] ||
    !options.firebase
  )
    throw Error("This sign-in provider needs configuration.");
  const [{ initializeApp, getApps }, sdk] = await loadSdk();
  const app =
    getApps().find((a) => a.name === "gharseva-identity") ||
    initializeApp(options.firebase, "gharseva-identity");
  const auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.inMemoryPersistence);
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
  try {
    const result = await sdk.signInWithPopup(auth, method);
    return await result.user.getIdToken(true);
  } finally {
    // A cleanup error must not mask cancellation/errors, or leave the UI falsely
    // reporting success. Firebase persistence above is exclusively in memory.
    await sdk.signOut(auth).catch(() => {});
  }
}
// Recover a Firebase redirect result only after an explicit user action. The
// application does not initiate redirect sign-in or persist a token itself.
export async function recoverExternalToken(options, loadSdk = defaultLoader) {
  if ((!options?.google && !options?.apple) || !options.firebase)
    throw Error("External sign-in needs configuration.");
  const [{ initializeApp, getApps }, sdk] = await loadSdk();
  const app =
    getApps().find((a) => a.name === "gharseva-identity") ||
    initializeApp(options.firebase, "gharseva-identity");
  const auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.inMemoryPersistence);
  try {
    const result = await sdk.getRedirectResult(auth);
    return result ? await result.user.getIdToken(true) : null;
  } finally {
    await sdk.signOut(auth).catch(() => {});
  }
}
