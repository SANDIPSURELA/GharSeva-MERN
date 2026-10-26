import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import {
  identityOptions,
  verifySmtpConnection,
} from "../server/src/identity-services.js";
import { paymentOptions } from "../server/src/payment-gateway.js";

dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
const args = process.argv.slice(2);
if (args.some((a) => a !== "--smtp-connect") || args.length > 1)
  throw Error(
    "Use no arguments, or --smtp-connect. This command never sends email.",
  );
const options = identityOptions(),
  payments = paymentOptions();
const configured = (name) =>
  process.env[name] ? "set (not verified)" : "missing";
console.log(
  JSON.stringify(
    {
      database: configured("MONGODB_URI"),
      sessionSecret: configured("JWT_SECRET"),
      storageKey: configured("IDENTITY_STORAGE_KEY"),
      authentication: options.demo
        ? "CLASSROOM - no email delivery"
        : "ordinary - requires actual email",
      email:
        options.email && !options.demo
          ? "configured, receipt NOT verified"
          : "missing live settings",
      google: options.google
        ? "configured, sign-in NOT verified"
        : "disabled or missing Firebase settings",
      apple: options.apple
        ? "configured, sign-in NOT verified"
        : "disabled or missing Firebase/Apple settings",
      payments: {
        mode: payments.mode,
        checkout: payments.enabled
          ? "configured, transaction NOT verified"
          : "setup required",
      },
      missing: [
        "MONGODB_URI",
        "JWT_SECRET",
        "IDENTITY_STORAGE_KEY",
        "SMTP_HOST",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "SMTP_FROM",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_WEB_API_KEY",
        "FIREBASE_AUTH_DOMAIN",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
      ].filter((k) => !process.env[k]),
      firebaseCredential:
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
          ? "configured, NOT verified"
          : "missing: GOOGLE_APPLICATION_CREDENTIALS OR FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY",
    },
    null,
    2,
  ),
);
if (args.includes("--smtp-connect")) {
  if (
    options.demo ||
    process.env.AUTH_DELIVERY_MODE !== "live" ||
    process.env.GHARSEVA_DEMO === "true"
  ) {
    console.error(
      "Connection check requires AUTH_DELIVERY_MODE=live and GHARSEVA_DEMO=false. No message sent.",
    );
    process.exitCode = 1;
  } else {
    try {
      await verifySmtpConnection();
      console.log(
        "SMTP connection/TLS/authentication succeeded. NO MESSAGE SENT. Inbox delivery remains unverified.",
      );
    } catch {
      console.error(
        "SMTP configuration or connection check failed. No message sent; no delivery verified.",
      );
      process.exitCode = 1;
    }
  }
}
