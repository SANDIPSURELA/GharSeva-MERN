import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import {
  identityOptions,
  emailReadiness,
  verifySmtpConnection,
} from "../server/src/identity-services.js";
import {
  paymentOptions,
  paymentReadiness,
} from "../server/src/payment-gateway.js";

dotenv.config({
  path: fileURLToPath(new URL("../server/.env", import.meta.url)),
  quiet: true,
});
const args = process.argv.slice(2);
if (
  args.some(
    (a) => !["--smtp-connect", "--email-ready", "--payments-ready"].includes(a),
  ) ||
  new Set(args).size !== args.length
)
  throw Error(
    "Use --email-ready, --payments-ready and/or --smtp-connect, or no arguments. No messages, charges or data changes.",
  );
const options = identityOptions(),
  payments = paymentOptions(),
  email = emailReadiness(),
  paymentConfig = paymentReadiness();
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
      email: {
        transport: email.transport,
        readiness: email.ready
          ? "configuration valid; provider acceptance and inbox receipt NOT verified"
          : "live configuration incomplete or invalid",
        issues: email.errors,
      },
      google: options.google
        ? "configured, sign-in NOT verified"
        : "disabled or missing Firebase settings",
      apple: options.apple
        ? "configured, sign-in NOT verified"
        : "disabled or missing Firebase/Apple settings",
      payments: {
        mode: payments.mode,
        issues: paymentConfig.errors,
        checkout: payments.enabled
          ? "configured, transaction NOT verified"
          : "setup required",
      },
      missing: [
        "MONGODB_URI",
        "JWT_SECRET",
        "IDENTITY_STORAGE_KEY",
        ...email.missing,
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
if (args.includes("--payments-ready") && !paymentConfig.ready) {
  console.error(
    "Payment readiness failed. Configuration only; no gateway request, charge or data change.",
  );
  process.exitCode = 1;
}
if (args.includes("--email-ready") && !email.ready) {
  console.error("Email readiness failed. Configuration only; no message sent.");
  process.exitCode = 1;
}
if (args.includes("--smtp-connect")) {
  if (!email.ready || email.transport !== "smtp") {
    console.error(
      "SMTP connection check requires a ready, selected SMTP transport in live mode. No message sent.",
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
