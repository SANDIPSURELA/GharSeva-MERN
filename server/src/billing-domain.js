import { fail, text } from "./domain.js";
import { paymentOptions } from "./payment-gateway.js";
export const NEW_PLAN = "DEPOSIT_BALANCE_V1";
export const CASH_PLAN = "CASH_AFTER_SERVICE_V1";
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
  if (options.depositValid === false)
    fail(
      503,
      "Deposit configuration requires review before booking. No payment policy was changed.",
    );
  const depositRupees = options.depositRupees ?? paymentOptions().depositRupees;
  if (
    !Number.isInteger(depositRupees) ||
    depositRupees < 1 ||
    depositRupees > 500
  )
    fail(503, "Deposit configuration requires review before booking.");
  const estimateAmount = rupeesToPaise(price);
  return {
    type: NEW_PLAN,
    // Missing gateway configuration cannot turn a new booking into a historical optional plan.
    mode: options.mode === "demo" ? "demo" : "razorpay_test",
    depositAmount: Math.min(depositRupees * 100, estimateAmount),
    estimateAmount,
    currency: "INR",
  };
}
// Cash after service is the default for NEW bookings only. Historical gateway plans stay intact.
export function cashPlanSnapshot(price) {
  return {
    type: CASH_PLAN,
    mode: "cash",
    depositAmount: 0,
    estimateAmount: rupeesToPaise(price),
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
const reference = (value) => String(value?._id ?? value ?? "");
export function paymentRecordIssue(b, p) {
  if (b.paymentPlan?.type === CASH_PLAN)
    return "Unexpected online payment on a cash-only booking. Contact support.";
  if (b.paymentPlan?.type !== NEW_PLAN) return "";
  const plan = b.paymentPlan,
    f = financialState(b),
    bill = currentBill(b);
  if (
    !p ||
    p.mode !== plan.mode ||
    p.currency !== "INR" ||
    !Number.isSafeInteger(p.amount) ||
    p.amount <= 0
  )
    return "Payment mode, currency or amount differs from the booking plan. Reconciliation required.";
  if (
    (b._id && reference(p.booking) !== reference(b._id)) ||
    (b.customer && reference(p.customer) !== reference(b.customer)) ||
    (b.provider && reference(p.provider) !== reference(b.provider))
  )
    return "Payment ownership or booking association mismatch. Reconciliation required.";
  if ((p.purpose || "VISIT_DEPOSIT") === "VISIT_DEPOSIT")
    return p.amount === plan.depositAmount
      ? ""
      : "Deposit amount differs from the saved plan. Reconciliation required.";
  if (
    p.purpose !== "FINAL_BALANCE" ||
    reference(f.balancePayment) !== reference(p._id) ||
    !bill ||
    bill.status !== "APPROVED" ||
    bill.version !== p.billVersion ||
    f.frozenVersion !== p.billVersion ||
    f.frozenAmount !== p.amount ||
    f.frozenCredit !== p.creditSnapshot ||
    !Number.isSafeInteger(f.frozenCredit) ||
    f.frozenCredit < 0 ||
    f.frozenCredit + f.frozenAmount !== bill.total
  )
    return "Balance payment is not bound to the current approved bill and frozen credit. Reconciliation required.";
  return "";
}

export function paymentSummary(b, payments, refunds = []) {
  if (b.paymentPlan?.type === CASH_PLAN) {
    const f = financialState(b);
    const bill = currentBill(b);
    const cash = f.cashReceipt;
    const valid = Boolean(bill?.status === "APPROVED" &&
      cash?.billVersion === bill.version && cash?.amount === bill.total);
    const confirmed = valid && !!cash.providerAt && !!cash.customerAt &&
      f.settledVersion === bill.version && f.settledTotal === bill.total && !!f.settledAt;
    const issue = payments.length || refunds.length
      ? "Unexpected online payment records on a cash booking require review." : "";
    let state = "AWAITING_ACCEPTANCE";
    if (b.status === "CANCELLED" || b.status === "REJECTED") state = b.status;
    else if (b.status === "COMPLETED") state = "AWAITING_BILL";
    else if (b.status !== "PENDING") state = "SERVICE_SCHEDULED";
    if (bill?.status === "SUBMITTED") state = "BILL_AWAITING_APPROVAL";
    if (bill?.status === "CORRECTION_REQUESTED") state = "BILL_CORRECTION_REQUESTED";
    if (bill?.status === "APPROVED") state = confirmed ? "SETTLED" :
      valid && cash.providerAt ? "CASH_AWAITING_CUSTOMER" : "CASH_DUE";
    if (issue) state = "RECONCILIATION_REQUIRED";
    return {
      state, total: bill?.total ?? null, grossCaptured: 0,
      unallocatedCaptured: 0, processedRefunds: 0, credit: 0,
      depositCredit: 0, balanceCaptured: 0,
      remaining: confirmed ? 0 : bill?.total ?? null,
      overpayment: 0, depositPaid: false, pendingRefund: false,
      refundReview: false, issue, settled: confirmed,
      cashReceipt: valid ? cash : null,
      payoutStatus: "NOT_APPLICABLE_CASH",
    };
  }
  const bill = currentBill(b),
    f = financialState(b),
    plan = b.paymentPlan;
  const capturedRecords = payments.filter((p) => CAPTURED.includes(p.status));
  const associationIssues = payments.map((p) => paymentRecordIssue(b, p));
  const eligible = capturedRecords.filter(
    (p) => (!plan || p.mode === plan.mode) && !paymentRecordIssue(b, p),
  );
  const unallocatedCaptured = capturedRecords
    .filter((p) => paymentRecordIssue(b, p))
    .reduce((n, p) => n + (p.capturedAmount ?? p.amount), 0);
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
    payments.find((p) => p.reconciliationIssue)?.reconciliationIssue ||
    associationIssues.find(Boolean) ||
    "";
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
    !paymentRecordIssue(b, deposit) &&
    CAPTURED.includes(deposit.status) &&
    deposit.mode === plan?.mode &&
    (deposit.capturedAmount ?? deposit.amount) -
      (deposit.refundedAmount || 0) >=
      plan.depositAmount &&
    !deposit.refundPending &&
    !deposit.reconciliationIssue;
  if (
    plan &&
    !depositPaid &&
    deposit &&
    ["CREATING", "AUTHORIZED"].includes(deposit.status)
  )
    state = "DEPOSIT_PROCESSING";
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
    unallocatedCaptured,
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
