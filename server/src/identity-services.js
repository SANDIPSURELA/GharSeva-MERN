import { createHmac } from "node:crypto";
import { fail, email, mobile } from "./domain.js";

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
    email:
      demo ||
      Boolean(
        process.env.AUTH_DELIVERY_MODE === "live" &&
        process.env.SMTP_HOST &&
        process.env.SMTP_FROM &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD,
      ),
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
// TLS remains mandatory. This contains server-only settings; never return it to a browser.
export function smtpTransportOptions(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASSWORD ||
    !env.SMTP_FROM
  )
    fail(503, "SMTP settings are incomplete or invalid. Contact support.");
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
export async function verifySmtpConnection() {
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport(smtpTransportOptions());
  try {
    await transporter.verify();
  } catch {
    fail(
      503,
      "SMTP connection/TLS/authentication check failed. No delivery was verified.",
    );
  } finally {
    transporter.close();
  }
}
export async function deliverCode(channel, contact, value, purpose) {
  if (demoDelivery()) return;
  if (channel === "mobile") {
    await twilio("Verifications", { To: `+91${contact}`, Channel: "sms" });
    return;
  }
  if (!identityOptions().email)
    fail(503, "Email delivery is not configured. Contact support.");
  const { default: nodemailer } = await import("nodemailer");
  try {
    const transporter = nodemailer.createTransport(smtpTransportOptions());
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: contact,
      subject: "Your GharSeva verification code",
      text: `Your GharSeva ${purpose === "recover" ? "password recovery" : purpose === "login" ? "sign-in" : purpose === "admin_reauth" ? "administrator security check" : "contact verification"} code is ${value}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.`,
    });
    if (
      !Array.isArray(result.accepted) ||
      !result.accepted.some(
        (address) => String(address).toLowerCase() === contact.toLowerCase(),
      ) ||
      result.rejected?.length
    )
      throw new Error("SMTP recipient was not accepted.");
  } catch {
    fail(
      503,
      "Email delivery is unavailable. Try again later or contact support.",
    );
  }
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
