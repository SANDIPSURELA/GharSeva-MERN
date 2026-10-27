import { createHmac, timingSafeEqual } from "node:crypto";
import { fail } from "./domain.js";
import { demoDelivery } from "./identity-services.js";
const cleanSecret = (value) =>
  typeof value === "string" &&
  /^[!-~]{8,512}$/.test(value) &&
  !/^(replace|your[_< -]|<|changeme)/i.test(value);
export function paymentReadiness(env = process.env) {
  const requested = env.PAYMENTS_MODE || "disabled",
    deposit = Number(env.PAYMENT_DEPOSIT_RUPEES || 99);
  const depositValid =
    Number.isInteger(deposit) && deposit >= 1 && deposit <= 500;
  const errors = [];
  if (requested !== "razorpay_test")
    errors.push("PAYMENTS_MODE must be razorpay_test for gateway readiness.");
  if (!/^rzp_test_[a-zA-Z0-9]{5,80}$/.test(env.RAZORPAY_KEY_ID || ""))
    errors.push(
      "RAZORPAY_KEY_ID must be a TEST key ID; live keys are refused.",
    );
  for (const key of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"])
    if (!cleanSecret(env[key])) errors.push(key + " is missing or malformed.");
  if (!depositValid)
    errors.push(
      "PAYMENT_DEPOSIT_RUPEES must retain a valid integer-rupee value from 1 to 500.",
    );
  if (
    env.NODE_ENV === "production" &&
    (env.GHARSEVA_DEMO === "true" || env.AUTH_DELIVERY_MODE === "test")
  )
    errors.push("Production classroom authentication is forbidden.");
  return {
    mode: ["disabled", "demo", "razorpay_test"].includes(requested)
      ? requested
      : "invalid",
    ready: errors.length === 0,
    errors,
    depositValid,
    depositRupees: depositValid ? deposit : 99,
  };
}
export function paymentOptions() {
  const readiness = paymentReadiness(),
    { depositRupees, depositValid } = readiness;
  if (readiness.mode === "demo" && demoDelivery() && depositValid)
    return {
      mode: "demo",
      enabled: true,
      depositRupees,
      depositValid,
      title: "Local classroom simulation",
      notice: "No gateway transaction or real money movement.",
    };
  if (readiness.mode === "razorpay_test")
    return {
      mode: "razorpay_test",
      enabled: readiness.ready,
      depositRupees,
      depositValid,
      title: "Razorpay test mode",
      notice: readiness.ready
        ? "Test transactions only. No live money collection."
        : "Razorpay TEST settings require review. No checkout or simulation fallback is available.",
    };
  return {
    mode: "disabled",
    enabled: false,
    depositRupees,
    depositValid,
    title: "Online payments unavailable",
    notice:
      "Online test payments are not configured. Required deposits and balances remain unpaid; contact support.",
  };
}
export function validSignature(value, expected) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/i.test(value) &&
    timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(expected, "hex"))
  );
}
export const checkoutSignature = (orderId, paymentId) =>
  createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
export function verifyWebhookSignature(body, value) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(body)) return false;
  return validSignature(
    value,
    createHmac("sha256", secret).update(body).digest("hex"),
  );
}
const identifier = (value, prefix) => {
  if (
    typeof value !== "string" ||
    !new RegExp(`^${prefix}_[a-zA-Z0-9]{5,80}$`).test(value)
  )
    fail(400, "Invalid gateway reference.");
  return value;
};
export function razorpayGateway(fetcher = fetch) {
  async function request(path, method = "GET", body) {
    const options = paymentOptions();
    if (options.mode !== "razorpay_test" || !options.enabled)
      fail(
        503,
        "Razorpay test payments are not configured. Live keys are not accepted by this version.",
      );
    let response, data;
    try {
      response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      data = await response.json();
    } catch {
      fail(
        503,
        "The gateway response is uncertain. Refresh payment status before trying again.",
      );
    }
    if (!response.ok)
      fail(
        503,
        "The test gateway request could not finish. Check the server credentials and refresh payment status.",
      );
    if (!data || typeof data !== "object" || Array.isArray(data) || data.error)
      fail(
        503,
        "The test gateway returned an unreadable response. Reconcile before retrying.",
      );
    return data;
  }
  return {
    createOrder: (p) =>
      request("orders", "POST", {
        amount: p.amount,
        currency: p.currency,
        receipt: p.receipt,
        partial_payment: false,
        notes: { gharseva_payment_id: String(p._id) },
      }),
    findOrder: async (receipt) => {
      const d = await request(
        `orders?${new URLSearchParams({ receipt, count: "100" })}`,
      );
      if (!Array.isArray(d.items) || d.items.length >= 100)
        fail(
          503,
          "Order history is unreadable or too large; reconciliation is required.",
        );
      const matches = d.items.filter((o) => o?.receipt === receipt);
      if (matches.length > 1)
        fail(
          409,
          "Multiple orders share this receipt. Administrator reconciliation is required.",
        );
      return matches[0] || null;
    },
    fetchOrder: (id) => request(`orders/${identifier(id, "order")}`),
    fetchPayment: (id) => request(`payments/${identifier(id, "pay")}`),
    paymentRefunds: async (id) => {
      const items = [];
      for (let skip = 0; skip < 1000; skip += 100) {
        const page = await request(
          `payments/${identifier(id, "pay")}/refunds?count=100&skip=${skip}`,
        );
        if (!Array.isArray(page.items)) fail(503, "Unreadable refund records.");
        items.push(...page.items);
        if (page.items.length < 100) return items;
      }
      fail(
        503,
        "Too many refund records to reconcile automatically. Contact support.",
      );
    },
    orderPayments: async (id) => {
      const d = await request(`orders/${identifier(id, "order")}/payments`);
      if (!Array.isArray(d.items))
        fail(503, "The gateway returned an unreadable payment list.");
      if (d.items.length >= 100)
        fail(
          503,
          "Payment attempt history requires administrator reconciliation.",
        );
      return d.items;
    },
  };
}
