import test from "node:test";
import assert from "node:assert/strict";
import { CASH_PLAN, NEW_PLAN, cashPlanSnapshot, paymentPlanSnapshot, paymentSummary } from "../src/billing-domain.js";
import { cashEligibility } from "../src/cash-payments.js";

const bill = { version: 1, status: "APPROVED", total: 12500 };
const customer = { _id: "customer", role: "customer" };
const provider = { _id: "provider", role: "provider", demoAccountId: "" };
function booking(override = {}) {
  return {
    _id: "book",
    provider,
    customer,
    status: "COMPLETED",
    paymentPlan: cashPlanSnapshot(125),
    billing: { revision: 0, version: 1, versions: [{ ...bill }], extras: [] },
    ...override,
  };
}

test("new cash plan requires no online deposit and preserves historical plan API", () => {
  const cash = cashPlanSnapshot(125);
  assert.equal(cash.type, CASH_PLAN);
  assert.equal(cash.mode, "cash");
  assert.equal(cash.depositAmount, 0);
  assert.equal(cash.estimateAmount, 12500);
  assert.equal(paymentPlanSnapshot(125, { mode: "demo", depositRupees: 99 }).type, NEW_PLAN);
});

test("cash payment is unavailable before completed service and approved bill", () => {
  assert.throws(() => cashEligibility(booking({ status: "IN_PROGRESS" }), provider, "provider"), /Complete the service/);
  const b = booking();
  b.billing.versions[0].status = "SUBMITTED";
  assert.throws(() => cashEligibility(b, provider, "provider"), /approve the final bill/);
  assert.throws(() => cashEligibility(booking(), provider, "provider", true), /Unexpected online payments/);
});

test("only assigned roles acknowledge cash; customer cannot confirm before provider records receipt", () => {
  const b = booking();
  assert.throws(() => cashEligibility(b, customer, "provider"), /assigned provider/);
  assert.throws(() => cashEligibility(b, customer, "customer"), /provider records/);
  b.billing.cashReceipt = { billVersion: 1, amount: 12500, providerAt: "2026-10-30T10:00:00.000Z" };
  assert.equal(cashEligibility(b, customer, "customer").bill.total, 12500);
  b.billing.cashReceipt.amount = 100;
  assert.throws(() => cashEligibility(b, customer, "customer"), /does not match/);
});

test("fictional showcase providers stay blocked from collecting cash", () => {
  const b = booking({ provider: { ...provider, demoAccountId: "owner-demo:test" } });
  assert.throws(() => cashEligibility(b, provider, "provider"), /Faculty showcase/);
});

test("cash summary is due, then awaiting customer, then settled only with both confirmations", () => {
  const b = booking();
  assert.equal(paymentSummary(b, []).state, "CASH_DUE");
  b.billing.cashReceipt = { billVersion: 1, amount: 12500, providerAt: "2026-10-30T10:00:00.000Z" };
  assert.equal(paymentSummary(b, []).state, "CASH_AWAITING_CUSTOMER");
  b.billing.cashReceipt.customerAt = "2026-10-30T10:05:00.000Z";
  assert.equal(paymentSummary(b, []).settled, false);
  b.billing.settledAt = "2026-10-30T10:05:00.000Z";
  b.billing.settledVersion = 1;
  b.billing.settledTotal = 12500;
  assert.equal(paymentSummary(b, []).state, "SETTLED");
  assert.equal(paymentSummary(b, []).remaining, 0);
  assert.match(paymentSummary(b, [{ _id: "bad" }]).issue, /online payment records/);
});
