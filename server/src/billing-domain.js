import { fail, text } from "./domain.js";
import { paymentOptions } from "./payment-gateway.js";
export const NEW_PLAN = "DEPOSIT_BALANCE_V1";
export const CAPTURED = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"];
export const unsettled = (p) =>
  ["CREATING", "READY", "AUTHORIZED", "FAILED"].includes(p.status);
export function paise(value, label = "Amount", min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > 100000000)
    fail(400, label + " must be integer paise within the supported limit.");
  return value;
}
export function rupeesToPaise(value) {
  const raw = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    fail(400, "Starting estimate must have at most two decimal places.");
  const [whole, decimal = ""] = raw.split(".");
  return paise(
    Number(whole) * 100 + Number(decimal.padEnd(2, "0")),
    "Starting estimate",
    1,
  );
}
export function paymentPlanSnapshot(price, options = paymentOptions()) {
  if (!["demo", "razorpay_test"].includes(options.mode)) return undefined;
  const estimateAmount = rupeesToPaise(price);
  return {
    type: NEW_PLAN,
    mode: options.mode,
    depositAmount: Math.min(options.depositRupees * 100, estimateAmount),
    estimateAmount,
    currency: "INR",
  };
}
export const financialState = (b) => ({
  revision: 0,
  version: 0,
  versions: [],
  extras: [],
  ...structuredClone(b.billing || {}),
});
export const currentBill = (b) =>
  financialState(b).versions.find(
    (v) => v.version === financialState(b).version,
  ) || null;
export function calculateBill(items, b) {
  if (!Array.isArray(items) || !items.length || items.length > 40)
    fail(400, "Provide 1–40 bill items.");
  const f = financialState(b),
    used = new Set();
  let service = 0;
  const clean = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      fail(400, "Provide a valid bill item.");
    if (item.kind === "EXTRA") {
      const extra = f.extras.find(
        (e) => e.id === item.extraId && e.status === "APPROVED",
      );
      if (!extra || used.has(extra.id))
        fail(400, "Use each customer-approved extra at most once.");
      used.add(extra.id);
      return {
        kind: "EXTRA",
        extraId: extra.id,
        label: extra.label,
        quantity: extra.quantity,
        unitAmount: extra.unitAmount,
        amount: extra.amount,
      };
    }
    if (item.kind !== "SERVICE") fail(400, "Choose service or approved extra.");
    const quantity = paise(item.quantity, "Quantity", 1);
    if (quantity > 1000) fail(400, "Quantity cannot exceed 1000.");
    const unitAmount = paise(item.unitAmount),
      amount = paise(quantity * unitAmount);
    service += amount;
    return {
      kind: "SERVICE",
      label: text(item.label, "Item description", 2, 120),
      quantity,
      unitAmount,
      amount,
    };
  });
  if (service > (b.paymentPlan?.estimateAmount ?? rupeesToPaise(b.price)))
    fail(
      400,
      "Service charges above the starting estimate need a separately approved extra.",
    );
  return {
    items: clean,
    total: paise(
      clean.reduce((n, i) => n + i.amount, 0),
      "Bill total",
    ),
  };
}
export function paymentSummary(b, payments, refunds = []) {
  const bill = currentBill(b),
    f = financialState(b),
    plan = b.paymentPlan;
  const eligible = payments.filter(
    (p) => CAPTURED.includes(p.status) && (!plan || p.mode === plan.mode),
  );
  const gross = eligible.reduce(
      (n, p) => n + (p.capturedAmount ?? p.amount),
      0,
    ),
    refunded = eligible.reduce((n, p) => n + (p.refundedAmount || 0), 0);
  const credits = Math.max(0, gross - refunded),
    pendingRefund = Boolean(
      refunds.some((r) => ["REQUESTED", "PENDING"].includes(r.status)) ||
      payments.some((p) => p.refundPending) ||
      f.refundReviews?.some((r) => r.status === "REQUESTED") ||
      f.demoRefunds?.some((r) => r.status === "RESERVED"),
    );
  const issue =
    payments.find((p) => p.reconciliationIssue)?.reconciliationIssue || "";
  const total = bill?.total ?? null;
  // A refund discovered with a delayed capture callback must not create new debt.
  // The immutable balance reservation proves the amount originally authorised.
  const capturedBalance = eligible.find(
    (p) =>
      p.purpose === "FINAL_BALANCE" &&
      String(p._id) === String(f.balancePayment),
  );
  const capturedFrozenBill =
    bill?.status === "APPROVED" &&
    f.frozenVersion === bill.version &&
    Number.isSafeInteger(f.frozenAmount) &&
    f.frozenAmount > 0 &&
    f.frozenCredit + f.frozenAmount === total &&
    capturedBalance &&
    (capturedBalance.capturedAmount ?? capturedBalance.amount) >=
      f.frozenAmount;
  const settled = !!f.settledAt || !!capturedFrozenBill;
  const refundReview =
    (["CANCELLED", "REJECTED"].includes(b.status) && credits > 0) ||
    (total !== null && credits > total) ||
    pendingRefund ||
    (settled && refunded > (f.refundedAtSettlement || 0));
  const remaining = settled
    ? 0
    : total === null
      ? null
      : Math.max(0, total - credits);
  let state = !plan
    ? "HISTORICAL_OPTIONAL_DEPOSIT"
    : b.status === "PENDING"
      ? "AWAITING_ACCEPTANCE"
      : "DEPOSIT_DUE";
  const deposit = payments.find(
    (p) => (p.purpose || "VISIT_DEPOSIT") === "VISIT_DEPOSIT",
  );
  const depositPaid =
    !!deposit &&
    CAPTURED.includes(deposit.status) &&
    deposit.mode === plan?.mode &&
    (deposit.capturedAmount ?? deposit.amount) -
      (deposit.refundedAmount || 0) >=
      plan.depositAmount &&
    !deposit.refundPending &&
    !deposit.reconciliationIssue;
  if (plan && depositPaid)
    state = b.status === "COMPLETED" ? "AWAITING_BILL" : "DEPOSIT_PAID";
  if (bill)
    state =
      bill.status === "SUBMITTED"
        ? "BILL_AWAITING_APPROVAL"
        : bill.status === "CORRECTION_REQUESTED"
          ? "BILL_CORRECTION_REQUESTED"
          : remaining === 0
            ? "SETTLED"
            : "BALANCE_DUE";
  if (
    f.balancePayment &&
    !settled &&
    payments.some((p) => p.purpose === "FINAL_BALANCE" && unsettled(p))
  )
    state = "BALANCE_PROCESSING";
  if (settled) state = "SETTLED";
  if (issue) state = "RECONCILIATION_REQUIRED";
  if (refundReview) state = "REFUND_REVIEW";
  return {
    state,
    total,
    grossCaptured: gross,
    processedRefunds: refunded,
    credit: credits,
    depositCredit: eligible
      .filter((p) => (p.purpose || "VISIT_DEPOSIT") === "VISIT_DEPOSIT")
      .reduce(
        (n, p) => n + (p.capturedAmount ?? p.amount) - (p.refundedAmount || 0),
        0,
      ),
    balanceCaptured: eligible
      .filter((p) => p.purpose === "FINAL_BALANCE")
      .reduce((n, p) => n + (p.capturedAmount ?? p.amount), 0),
    remaining,
    overpayment: total === null ? 0 : Math.max(0, credits - total),
    depositPaid,
    pendingRefund,
    refundReview,
    issue,
    settled,
    payoutStatus: "NOT_INITIATED",
  };
}
