import { createHmac } from "node:crypto";
import { fail, email, mobile } from "./domain.js";
import { emailReadiness, deliverEmailCode } from "./email-delivery.js";
import { socialReadiness } from "./social-readiness.js";
export {
  verifyExternal,
  externalIdentityFromClaims,
} from "./firebase-identity.js";
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
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw Error("Firebase Auth emulator is forbidden in production.");
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
  const social = socialReadiness();
  const firebaseReady =
    social.ready && (social.google.enabled || social.apple.enabled);
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
    google: social.google.configured,
    apple: social.apple.configured,
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
