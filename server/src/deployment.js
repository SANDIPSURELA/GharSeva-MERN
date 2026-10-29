import { existsSync } from "node:fs";
import { socialReadiness } from "./social-readiness.js";
import { emailReadiness } from "./email-delivery.js";
import { paymentReadiness } from "./payment-gateway.js";
import { fileURLToPath } from "node:url";

export const clientDist = fileURLToPath(
  new URL("../../client/dist/", import.meta.url),
);

export function proxyHops(env = process.env) {
  const value = env.TRUST_PROXY_HOPS ?? "0";
  if (!/^[0-3]$/.test(String(value)))
    throw new Error(
      "TRUST_PROXY_HOPS must be an integer from 0 to 3; never use true.",
    );
  return Number(value);
}

// Configuration checks do not connect to providers or expose secret values.
export function inspectEnvironment(
  env = process.env,
  { requireBuild = true, dist = clientDist } = {},
) {
  const errors = [],
    warnings = [];
  if (
    !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || "") ||
    /YOUR_CLUSTER|DB_USERNAME|DB_PASSWORD/.test(env.MONGODB_URI || "")
  )
    errors.push("MONGODB_URI must be a configured MongoDB connection string.");
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET.length < 32 ||
    /^(replace_|change|example)/i.test(env.JWT_SECRET)
  )
    errors.push(
      "JWT_SECRET must be a random secret of at least 32 characters.",
    );
  try {
    proxyHops(env);
  } catch (e) {
    errors.push(e.message);
  }
  if (
    env.PORT !== undefined &&
    (!/^\d+$/.test(String(env.PORT)) ||
      Number(env.PORT) < 1 ||
      Number(env.PORT) > 65535)
  )
    errors.push("PORT must be an integer from 1 to 65535.");
  if (env.NODE_ENV === "production") {
    try {
      const url = new URL(env.CLIENT_ORIGIN);
      if (
        url.protocol !== "https:" ||
        url.origin !== env.CLIENT_ORIGIN ||
        url.username ||
        url.password ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new Error();
    } catch {
      errors.push(
        "CLIENT_ORIGIN must be the exact public HTTPS origin without a path or trailing slash.",
      );
    }
    if (
      !/^[a-f0-9]{64}$/i.test(env.IDENTITY_STORAGE_KEY || "") ||
      /^(.)\1+$/.test(env.IDENTITY_STORAGE_KEY || "")
    )
      errors.push(
        "IDENTITY_STORAGE_KEY must be 32 random bytes encoded as 64 hex characters. Keep the existing key for existing encrypted records.",
      );
    if (env.GHARSEVA_DEMO === "true" || env.AUTH_DELIVERY_MODE === "test")
      errors.push("Classroom authentication is forbidden in production.");
    if (
      !["disabled", "razorpay_test"].includes(env.PAYMENTS_MODE || "disabled")
    )
      errors.push(
        "Production PAYMENTS_MODE must be disabled or razorpay_test. Live collection is not implemented.",
      );
    if (env.PAYMENTS_MODE === "razorpay_test")
      errors.push(...paymentReadiness(env).errors);
    if (requireBuild && !existsSync(`${dist}/index.html`))
      errors.push(
        "The React build is missing. Run npm run build before production startup.",
      );
    if (!emailReadiness(env).ready)
      warnings.push(
        "Email verification, password-plus-email-OTP login and recovery need the selected email transport configured and an owner-confirmed inbox test.",
      );
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_AUTH_TOKEN ||
      !env.TWILIO_VERIFY_SERVICE_SID
    )
      warnings.push(
        "Phone OTP needs Twilio Verify setup and a real SMS delivery test.",
      );
    if (env.ASSISTANT_AI_ENABLED === "true" && !env.OPENAI_API_KEY)
      errors.push(
        "ASSISTANT_AI_ENABLED requires the server-side OPENAI_API_KEY.",
      );
    if (env.FIREBASE_AUTH_EMULATOR_HOST)
      errors.push("Firebase Auth emulator is forbidden in production.");
    if (
      ["AUTH_GOOGLE_ENABLED", "AUTH_APPLE_ENABLED"].some(
        (key) => env[key] === "true",
      )
    ) {
      const social = socialReadiness(env);
      if (!social.ready)
        warnings.push(
          "Enabled social sign-in is unavailable until Firebase setup is valid. Password/email OTP settings remain independent.",
          ...social.errors,
        );
    }
  }
  return { errors, warnings };
}

export function validateEnvironment(env = process.env, options) {
  const report = inspectEnvironment(env, options);
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  return report;
}
