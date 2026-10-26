import { createHmac, timingSafeEqual } from "node:crypto";
import { fail } from "./domain.js";
import { demoDelivery } from "./identity-services.js";
export function paymentOptions() {
  const requested = process.env.PAYMENTS_MODE || "disabled",
    deposit = Number(process.env.PAYMENT_DEPOSIT_RUPEES || 99);
  const depositRupees =
    Number.isInteger(deposit) && deposit >= 1 && deposit <= 500 ? deposit : 99;
  if (requested === "demo" && demoDelivery())
    return {
      mode: "demo",
      enabled: true,
      depositRupees,
      title: "Local classroom simulation",
      notice: "No gateway transaction or real money movement.",
    };
  if (requested === "razorpay_test") {
    const enabled =
      /^rzp_test_[a-zA-Z0-9]+$/.test(process.env.RAZORPAY_KEY_ID || "") &&
      Boolean(
        process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET,
      );
    return {
      mode: "razorpay_test",
      enabled,
      depositRupees,
      title: "Razorpay test mode",
      notice: enabled
        ? "Test transactions only. No live money collection."
        : "Razorpay test keys and webhook secret need configuration.",
    };
  }
  return {
    mode: "disabled",
    enabled: false,
    depositRupees,
    title: "Online payments unavailable",
    notice:
      "Online test payments are not configured. Existing payment requirements and records are unchanged; contact support.",
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
      return Array.isArray(d.items)
        ? d.items.find((o) => o.receipt === receipt) || null
        : null;
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
