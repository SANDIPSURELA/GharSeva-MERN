import { fail } from "./domain.js";

const unavailable = () =>
  fail(
    503,
    "Email delivery is unavailable. Try again later or contact support.",
  );
const mailbox = (value) =>
  typeof value === "string" &&
  value.length <= 120 &&
  /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(
    value,
  );
const clean = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\r\n\x00]/.test(value);
const smtpSender = (value) =>
  clean(value) &&
  (mailbox(value) ||
    (/^[^<>@;,\r\n]+<([^<>]+)>$/.test(value) &&
      mailbox(value.match(/<([^<>]+)>$/)[1])));

// Safe configuration report: names/status only, never configuration values.
// An omitted selector retains SMTP compatibility for existing installations.
export function emailReadiness(env = process.env) {
  const transport =
    env.EMAIL_TRANSPORT === undefined ? "smtp" : env.EMAIL_TRANSPORT;
  const errors = [],
    required =
      transport === "brevo"
        ? ["BREVO_API_KEY", "EMAIL_FROM_ADDRESS"]
        : transport === "smtp"
          ? ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]
          : [];
  if (!["smtp", "brevo"].includes(transport))
    errors.push("EMAIL_TRANSPORT must be smtp or brevo.");
  if (env.AUTH_DELIVERY_MODE !== "live")
    errors.push("AUTH_DELIVERY_MODE must be live.");
  if (env.GHARSEVA_DEMO === "true")
    errors.push("GHARSEVA_DEMO must be false for live email.");
  for (const key of required)
    if (!clean(env[key])) errors.push(key + " is missing or malformed.");
  if (transport === "brevo") {
    if (!mailbox(env.EMAIL_FROM_ADDRESS))
      errors.push("EMAIL_FROM_ADDRESS must be one plain email address.");
    if (
      env.BREVO_API_KEY &&
      (!/^[\x21-\x7e]{16,512}$/.test(env.BREVO_API_KEY) ||
        /^(replace|your[_ -]|example|changeme)/i.test(env.BREVO_API_KEY))
    )
      errors.push("BREVO_API_KEY is malformed or a placeholder.");
    if (
      env.EMAIL_FROM_NAME !== undefined &&
      (!clean(env.EMAIL_FROM_NAME) || env.EMAIL_FROM_NAME.length > 100)
    )
      errors.push(
        "EMAIL_FROM_NAME must be a single-line name of at most 100 characters.",
      );
  }
  if (transport === "smtp") {
    if (!smtpSender(env.SMTP_FROM))
      errors.push("SMTP_FROM must contain one valid sender mailbox.");
    if (env.SMTP_HOST && !/^[a-z0-9.-]+$/i.test(env.SMTP_HOST))
      errors.push("SMTP_HOST must be a hostname.");
    const port = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      errors.push("SMTP_PORT must be an integer from 1 to 65535.");
  }
  return {
    transport: ["smtp", "brevo"].includes(transport) ? transport : "invalid",
    ready: errors.length === 0,
    errors,
    missing: required.filter((key) => !clean(env[key])),
  };
}

// TLS remains mandatory. This object is server-only.
export function smtpTransportOptions(env = process.env) {
  if (
    !emailReadiness({
      ...env,
      EMAIL_TRANSPORT: "smtp",
      AUTH_DELIVERY_MODE: "live",
      GHARSEVA_DEMO: "false",
    }).ready
  )
    fail(503, "SMTP settings are incomplete or invalid. Contact support.");
  const port = Number(env.SMTP_PORT || 587);
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

export async function deliverEmailCode(contact, value, purpose) {
  const config = emailReadiness();
  if (!config.ready)
    fail(503, "Email delivery is not configured. Contact support.");
  if (!mailbox(contact) || !/^\d{6}$/.test(value)) unavailable();
  const subject = "Your GharSeva verification code";
  const description =
    purpose === "recover"
      ? "password recovery"
      : purpose === "login"
        ? "sign-in"
        : purpose === "admin_reauth"
          ? "administrator security check"
          : "contact verification";
  const text =
    "Your GharSeva " +
    description +
    " code is " +
    value +
    ". It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.";
  if (config.transport === "brevo") {
    try {
      // One attempt only: uncertain acceptance must not trigger an automatic send/retry.
      // Fixed HTTPS origin and no redirects prevent forwarding credentials elsewhere.
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: {
            email: process.env.EMAIL_FROM_ADDRESS,
            name: process.env.EMAIL_FROM_NAME || "GharSeva",
          },
          to: [{ email: contact }],
          subject,
          textContent: text,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        unavailable();
      }
      const result = await response.json();
      if (
        typeof result?.messageId !== "string" ||
        !result.messageId.trim() ||
        result.code ||
        result.error
      )
        unavailable();
      // Acceptance is not inbox receipt. Neither the response body nor code is logged/returned.
    } catch {
      unavailable();
    }
    return;
  }
  const { default: nodemailer } = await import("nodemailer");
  let transporter;
  try {
    transporter = nodemailer.createTransport(smtpTransportOptions());
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: contact,
      subject,
      text,
    });
    if (
      !Array.isArray(result.accepted) ||
      !result.accepted.some(
        (address) => String(address).toLowerCase() === contact.toLowerCase(),
      ) ||
      result.rejected?.length
    )
      unavailable();
  } catch {
    unavailable();
  } finally {
    transporter?.close?.();
  }
}
