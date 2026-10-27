import { createHmac } from "node:crypto";
import { fail, email, mobile } from "./domain.js";
import { emailReadiness, deliverEmailCode } from "./email-delivery.js";
export {
  emailReadiness,
  smtpTransportOptions,
  verifySmtpConnection,
} from "./email-delivery.js";

export function demoDelivery() {
  return (
    process.env.AUTH_DELIVERY_MODE === "test" &&
    process.env.GHARSEVA_DEMO === "true" &&
    process.env.NODE_ENV !== "production"
  );
}
export function validateIdentityEnvironment() {
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.AUTH_DELIVERY_MODE === "test" ||
      process.env.GHARSEVA_DEMO === "true")
  )
    throw new Error(
      "Demo authentication is forbidden in production. Configure live delivery.",
    );
}
export function identityOptions() {
  const demo = demoDelivery();
  const firebaseReady = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_WEB_API_KEY &&
    process.env.FIREBASE_AUTH_DOMAIN &&
    (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)),
  );
  return {
    demo,
    email: demo || emailReadiness().ready,
    mobile:
      demo ||
      Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_VERIFY_SERVICE_SID,
      ),
    google: firebaseReady && process.env.AUTH_GOOGLE_ENABLED === "true",
    apple: firebaseReady && process.env.AUTH_APPLE_ENABLED === "true",
    firebase: firebaseReady
      ? {
          apiKey: process.env.FIREBASE_WEB_API_KEY,
          authDomain: process.env.FIREBASE_AUTH_DOMAIN,
          projectId: process.env.FIREBASE_PROJECT_ID,
        }
      : null,
  };
}
export function normaliseContact(channel, value) {
  if (channel === "email") return email(value);
  if (channel !== "mobile") fail(400, "Choose email or mobile verification.");
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return mobile(digits);
}
export const contactKey = (channel, contact) =>
  createHmac("sha256", process.env.JWT_SECRET)
    .update(`${channel}:${contact}`)
    .digest("hex");
export const codeDigest = (id, code) =>
  createHmac("sha256", process.env.JWT_SECRET)
    .update(`${id}:${code}`)
    .digest("hex");

async function twilio(path, values) {
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID)}/${path}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(values),
    },
  );
  const result = await response.json();
  if (!response.ok)
    fail(503, "SMS verification is unavailable. Try again later or use email.");
  return result;
}
export async function deliverCode(channel, contact, value, purpose) {
  validateIdentityEnvironment();
  if (demoDelivery()) return;
  if (channel === "mobile") {
    await twilio("Verifications", { To: "+91" + contact, Channel: "sms" });
    return;
  }
  if (channel !== "email") fail(400, "Choose email or mobile verification.");
  await deliverEmailCode(contact, value, purpose);
}
export async function checkSms(contact, value) {
  return (
    (await twilio("VerificationCheck", { To: `+91${contact}`, Code: value }))
      .status === "approved"
  );
}
let firebaseApp;
export async function verifyExternal(idToken) {
  if (typeof idToken !== "string" || idToken.length > 10000)
    fail(400, "Choose a valid external sign-in method.");
  const options = identityOptions();
  if (!options.google && !options.apple)
    fail(503, "External sign-in is not configured yet.");
  const { initializeApp, cert, applicationDefault } =
    await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  if (!firebaseApp)
    firebaseApp = initializeApp(
      {
        projectId: process.env.FIREBASE_PROJECT_ID,
        credential: process.env.FIREBASE_PRIVATE_KEY
          ? cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
                /\\n/g,
                "\n",
              ),
            })
          : applicationDefault(),
      },
      "gharseva-identity",
    );
  let claims;
  try {
    claims = await getAuth(firebaseApp).verifyIdToken(idToken, true);
  } catch {
    fail(401, "External sign-in could not be verified. Please try again.");
  }
  return externalIdentityFromClaims(claims, options);
}
export function externalIdentityFromClaims(
  claims,
  options = identityOptions(),
) {
  const provider = claims.firebase?.sign_in_provider;
  if (
    !["google.com", "apple.com"].includes(provider) ||
    !(provider === "google.com" ? options.google : options.apple)
  )
    fail(403, "This sign-in provider is not enabled.");
  if (!claims.email_verified || !claims.email)
    fail(400, "Use an external account with a verified email address.");
  if (
    typeof claims.uid !== "string" ||
    !claims.uid ||
    !Number.isFinite(claims.auth_time) ||
    Date.now() / 1000 - claims.auth_time > 600 ||
    claims.auth_time > Date.now() / 1000 + 60
  )
    fail(401, "Sign in again to confirm your identity.");
  return {
    uid: claims.uid,
    provider,
    contact: email(claims.email),
    name: typeof claims.name === "string" ? claims.name.slice(0, 80) : "",
  };
}
