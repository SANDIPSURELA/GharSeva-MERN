import { Booking, Payment, PaymentRefund } from "./models.js";
import { auth, role } from "./auth.js";
import { fail } from "./domain.js";
import { CASH_PLAN, currentBill, financialState } from "./billing-domain.js";
import { bookingFor, paymentContext } from "./payments.js";
import { updateFinance, audit } from "./billing.js";
import { ownerImportedDemo } from "./faculty-showcase.js";

// A cash acknowledgment records both parties' statements, not proof of a bank transfer.
// Optimistic billing.revision checks prevent double acknowledgment or lost updates.
export function cashEligibility(b, actor, action, hasPaymentRecords = false) {
  if (b.paymentPlan?.type !== CASH_PLAN)
    fail(409, "This booking does not use cash-after-service payment.");
  if (b.status !== "COMPLETED")
    fail(409, "Complete the service before recording cash payment.");
  if (hasPaymentRecords)
    fail(409, "Unexpected online payments require reconciliation before cash recording.");
  if (b.provider?.demoAccountId || ownerImportedDemo(b.provider))
    fail(403, "Faculty showcase providers cannot collect customer payments.");
  const bill = currentBill(b);
  if (!bill || bill.status !== "APPROVED")
    fail(409, "The customer must approve the final bill first.");
  const f = financialState(b);
  const receipt = f.cashReceipt;
  if (receipt && (receipt.billVersion !== bill.version || receipt.amount !== bill.total))
    fail(409, "Cash receipt does not match the approved bill; administrator review required.");
  if (action === "provider" && actor.role !== "provider")
    fail(403, "Only the assigned provider can record receiving cash.");
  if (action === "customer" && actor.role !== "customer")
    fail(403, "Only the assigned customer can confirm cash payment.");
  if (action === "customer" && !receipt?.providerAt)
    fail(409, "Wait until the provider records cash received.");
  return { bill, f, receipt };
}

export function mountCashPayments(app) {
  app.post("/api/payments/booking/:id/cash/received", auth, role("provider"), async (req, res) => {
    if (req.body?.confirm !== true)
      fail(400, "Confirm that you actually received the agreed cash amount.");
    const b = await bookingFor(req.params.id, req.user);
    const payments = await Payment.exists({ booking: b._id });
    const refunds = await PaymentRefund.exists({ booking: b._id });
    const { bill, f, receipt } = cashEligibility(b, req.user, "provider", !!payments || !!refunds);
    if (receipt?.providerAt) return res.json(await paymentContext(b._id, req.user));
    const stamp = new Date().toISOString();
    f.cashReceipt = {
      billVersion: bill.version, amount: bill.total,
      providerAt: stamp, providerBy: String(req.user._id),
      history: [audit("CASH_RECEIVED_BY_PROVIDER", req.user)],
    };
    await updateFinance(b, f);
    res.json(await paymentContext(b._id, req.user));
  });
  app.post("/api/payments/booking/:id/cash/confirm", auth, role("customer"), async (req, res) => {
    if (req.body?.confirm !== true)
      fail(400, "Confirm that you actually paid cash to the provider.");
    const b = await bookingFor(req.params.id, req.user);
    const payments = await Payment.exists({ booking: b._id });
    const refunds = await PaymentRefund.exists({ booking: b._id });
    const { bill, f, receipt } = cashEligibility(b, req.user, "customer", !!payments || !!refunds);
    if (receipt.customerAt && f.settledAt)
      return res.json(await paymentContext(b._id, req.user));
    const stamp = new Date().toISOString();
    f.cashReceipt = {
      ...receipt, customerAt: stamp, customerBy: String(req.user._id),
      history: [...(receipt.history || []), audit("CASH_CONFIRMED_BY_CUSTOMER", req.user)],
    };
    f.settledAt = stamp;
    f.settledVersion = bill.version;
    f.settledTotal = bill.total;
    f.settledCredits = 0;
    await updateFinance(b, f);
    res.json(await paymentContext(b._id, req.user));
  });
}
