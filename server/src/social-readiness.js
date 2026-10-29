import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
// Local syntax/readability checks only; never contact Firebase or expose credentials.
export function firebaseCredential(env = process.env) {
  if (env.FIREBASE_PRIVATE_KEY || env.FIREBASE_CLIENT_EMAIL) {
    if (!env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL)
      throw Error(
        "Provide both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
      );
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  if (!env.GOOGLE_APPLICATION_CREDENTIALS)
    throw Error(
      "Provide GOOGLE_APPLICATION_CREDENTIALS or the inline Firebase Admin credential pair.",
    );
  let data;
  try {
    data = JSON.parse(readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  } catch {
    throw Error(
      "GOOGLE_APPLICATION_CREDENTIALS must name a readable service-account JSON file.",
    );
  }
  if (
    data.type !== "service_account" ||
    data.project_id !== env.FIREBASE_PROJECT_ID
  )
    throw Error(
      "The Admin service account must belong to FIREBASE_PROJECT_ID.",
    );
  return {
    projectId: data.project_id,
    clientEmail: data.client_email,
    privateKey: data.private_key,
  };
}
export function socialReadiness(env = process.env) {
  const errors = [];
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || ""))
    errors.push("FIREBASE_PROJECT_ID is missing or malformed.");
  if (!/^AIza[0-9A-Za-z_-]{30,50}$/.test(env.FIREBASE_WEB_API_KEY || ""))
    errors.push("FIREBASE_WEB_API_KEY is missing or malformed.");
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(
      env.FIREBASE_AUTH_DOMAIN || "",
    )
  )
    errors.push(
      "FIREBASE_AUTH_DOMAIN must be a hostname with configured Firebase auth handlers, without a URL scheme/path.",
    );
  if (env.FIREBASE_AUTH_EMULATOR_HOST)
    errors.push(
      "Firebase Auth emulator tokens are not supported by this application verifier. Remove FIREBASE_AUTH_EMULATOR_HOST.",
    );
  try {
    const credential = firebaseCredential(env);
    if (
      !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(
        credential.clientEmail || "",
      )
    )
      throw Error("FIREBASE_CLIENT_EMAIL/service-account email is malformed.");
    if (
      typeof credential.privateKey !== "string" ||
      createPrivateKey(credential.privateKey).asymmetricKeyType !== "rsa"
    )
      throw Error(
        "The Firebase Admin private key must be a valid RSA PEM key.",
      );
  } catch (error) {
    errors.push(
      /^Provide |^GOOGLE_APPLICATION_CREDENTIALS |^The Admin |^FIREBASE_CLIENT_EMAIL|^The Firebase Admin/.test(
        error.message,
      )
        ? error.message
        : "The Firebase Admin private key is missing or malformed.",
    );
  }
  const enabled = (provider) =>
    env[
      provider === "google" ? "AUTH_GOOGLE_ENABLED" : "AUTH_APPLE_ENABLED"
    ] === "true";
  return {
    ready: errors.length === 0,
    errors,
    google: {
      configured: enabled("google") && errors.length === 0,
      enabled: enabled("google"),
    },
    apple: {
      configured: enabled("apple") && errors.length === 0,
      enabled: enabled("apple"),
    },
  };
}
