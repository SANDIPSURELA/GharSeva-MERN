> Current milestone: [Two-stage payments setup and review](PAYMENTS-TWO-STAGE-UPDATE.md). The optional-deposit notes below describe historical bookings. New plan bookings require captured deposit plus visit OTP, followed by customer-approved final-balance payment.

# Optional visit deposits and test-payment ledger — 24 October 2026

This update follows the admin invitation milestone and includes all previous login, registration, identity-review and customer-assistant work. It adds **optional visit deposits**, payment receipts and a role-scoped ledger. It supports a local classroom simulation and a real **Razorpay Test Mode adapter**. No Razorpay keys were supplied or external transaction executed here. Live keys are refused by this version.

## Payment behaviour

The ordinary booking journey and pay-on-site option remain available. A customer can choose an optional ₹99 visit deposit after the professional accepts a booking, while it is ACCEPTED, ON_THE_WAY or IN_PROGRESS. A new deposit is blocked for pending, cancelled, rejected or completed bookings and unavailable/unapproved professionals. Existing receipts remain readable after booking completion/cancellation.

The server calculates the deposit from the saved booking, defaults to ₹99 and caps it at that booking's starting estimate. It ignores customer-supplied prices, currency and owner IDs. The receipt identifies **VISIT_DEPOSIT**, not a complete service invoice. The deposit is credited toward agreed service charges; remaining work/material charges are handled separately with the professional. Additional charges are not automatically collected or calculated as a final invoice. The displayed remaining starting estimate is not a final quote.

Creating, paying or refunding a deposit never changes the booking status, bypasses provider acceptance, starts work or substitutes for the visit OTP. Completed service estimates remain separate from captured test-deposit records and are not reported as collected earnings. Provider payouts, marketplace settlement, GST invoicing and live money collection are not implemented.

## Classroom demonstration — no payment account needed

1. Run `npm.cmd ci`, then `npm.cmd run demo`. The temporary launcher explicitly enables **local classroom simulation** and does not create a Razorpay transaction.
2. Create a normal customer booking and have the assigned provider accept it in a separate browser profile.
3. In the customer dashboard, open My bookings → **Visit deposit & receipt**. Read the ₹99 deposit, starting estimate, remaining estimate and test-mode notice. Tick the amount acknowledgement.
4. Choose **Continue with local demo**. The simulation asks for no card, bank or UPI information. Demonstrate a failure, cancellation, retry and success.
5. A captured simulation produces a clearly labelled test receipt. Download its text receipt or revisit it in **Deposits & receipts**. The booking still has its original status.
6. The assigned professional can see their deposit records. Other customers/providers cannot read this booking's payment record.
7. In admin → **Payment ledger**, inspect test captured/refunded amounts and the separate booking status. Open the deposit and simulate a full refund after confirmation. Duplicate refund clicks cannot increase the refunded amount twice.
8. Cancelling/rejecting a booking after a captured deposit flags **Refund review needed**. It does not silently erase the payment or claim that a refund happened.

The demo database is temporary. Use a persistent MongoDB configuration for saved classroom records. The simulation is available only when `PAYMENTS_MODE=demo` and the existing explicit non-production classroom-auth mode is enabled. It cannot modify a Razorpay record. Production refuses classroom authentication and does not permit simulation through payment options.

## Connect your own Razorpay TEST account

1. Use your own Razorpay dashboard account and switch to **Test Mode**. Generate Test API keys. Account access and payment-method availability must be checked in that account. Do not send keys in chat.
2. Configure persistent MongoDB, a strong session secret and the normal development server as in START-HERE.md. Stop `npm.cmd run demo`: that launcher forces local payment simulation. Use `npm.cmd run dev` or the built server for gateway testing.
3. Put these values in **server/.env** or the host's secret settings:

```dotenv
PAYMENTS_MODE=razorpay_test
PAYMENT_DEPOSIT_RUPEES=99
RAZORPAY_KEY_ID=rzp_test_YOUR_TEST_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_PRIVATE_TEST_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_RANDOM_WEBHOOK_SECRET
```

Use a long random webhook secret and configure the same value in Razorpay. `PAYMENT_DEPOSIT_RUPEES` accepts an integer from 1 to 500; the default is 99. Each saved order snapshots its own amount, so changing this setting does not alter previous orders. Key ID is the publishable checkout identifier; key secret and webhook secret stay on the server. No key is included in the ZIP.

4. In the Razorpay **Test** dashboard, configure automatic capture for Orders-based payments. GharSeva distinguishes AUTHORISED from CAPTURED; an authorised payment is not displayed as a captured deposit.
5. Configure the test webhook endpoint as your own HTTPS Node host plus `/api/payments/webhook`. Subscribe to `payment.captured`, `payment.authorized`, `payment.failed`, `refund.created`, `refund.processed` and `refund.failed`. Webhook delivery needs a reachable public endpoint; localhost by itself is insufficient. Public hosting is a separate remaining milestone. Follow Razorpay's current staging/tunnel restrictions rather than assuming every tunnelling service works.
6. Restart the API. `/api/payments/options` should report Razorpay test mode and `enabled:true`. This only establishes that configuration values exist in the expected format; it does not prove API access or a successful transaction.
7. Use a **fresh accepted booking** for testing. Existing local-demo ledgers cannot be turned into gateway records. Open its deposit review, acknowledge the amount and open Razorpay test checkout. Follow Razorpay's official test instructions; never enter real financial details in a classroom demonstration.
8. Complete success, failure and checkout-close cases. GharSeva's callback sends the gateway references/signature to Express. The server verifies the signature against its stored order and fetches authoritative payment details. It marks capture only after the order, amount, INR currency and captured status agree. Closing checkout does not prove payment failure; **Refresh payment status** reconciles attempts for the stored order.
9. To test a gateway refund, issue it in the **Razorpay Test dashboard**, then refresh GharSeva or receive a signed webhook. The app reconciles partial/full refund amounts. It does not initiate gateway refunds. The admin's full-refund button is a local simulation only.
10. Verify actual hosted checkout, webhook delivery, CSP behaviour, payment-account access, status recovery and receipts with your own test account before relying on a faculty demonstration. The Express CSP permits the specific checkout/API origins used by the implementation; any additional vendor origin must be investigated rather than broadly allowing arbitrary sites.

The configured test gateway adapter uses `https://api.razorpay.com/v1/` from the server. The checkout script is loaded from `https://checkout.razorpay.com/v1/checkout.js` only when the customer chooses configured Razorpay test checkout. Financial entry is handled there; GharSeva does not collect card numbers, CVVs, UPI credentials or bank credentials. It does not prefill the customer's saved address or account contacts into checkout.

## Retries, receipts and reconciliation

Each booking has at most one deposit ledger and one stored order reference. Repeated or competing requests reuse it. A unique receipt is sent when creating an order. If creation times out, the server retains a CREATING record and does not blindly send another order request; refreshing looks up the trusted receipt and reconciles an existing gateway order. If no matching order is found, the record stays uncertain and requires another later refresh or administrator investigation. There is no automatic destructive reset/recreation for that case. Keep the original test account configuration while reconciling outstanding orders.

Checkout signatures use the **stored** order ID and returned payment ID. A signature alone is insufficient: the server fetches and validates the gateway record. The anonymous webhook is mounted before the ordinary JSON/request-header middleware only at the exact POST webhook route. It verifies HMAC over the raw request bytes before parsing, checks duplicate event references/body hashes and fetches current gateway state. All other application writes retain their normal authentication/request-header rules. Old or duplicate events cannot downgrade a captured payment or reduce a recorded refund amount. No raw webhook payload is stored.

Ledger records retain booking/customer/provider references, mode, amount/currency, gateway IDs, purpose, status, refund total and a minimal activity history. Receipts are labelled local demo or Razorpay test and are not tax invoices. Card/bank/UPI credentials, raw checkout signatures, full gateway responses and gateway secrets are not retained. Payment history is separate from the booking's visit code and service estimate. Refund flags require a person's review; the system never claims that cancellation automatically returned funds.

## Validation and limits

**151 backend tests pass**: the previous 128 plus 23 payment tests. These use Express and temporary MongoDB with a mocked gateway transport for authorisation, amount/owner tampering, duplicate order creation, checkout signatures, amount/currency/order mismatches, pending authorisation, raw-body webhook verification, duplicate/out-of-order events, concurrent callback/webhook reconciliation, partial/full refunds, cancellation flags, uncertain-order recovery, mode separation, unavailable professionals and refusal of live keys. A separate HTTP-adapter contract test checks the fixed API origin, server Basic authentication and paise/order payload. No live Razorpay API, checkout or webhook delivery was tested here.

The production React build passes. Browser checks use isolated fictional fixtures and cover deposit acknowledgement, local failure/retry/success, receipt display, admin refund/cancel/confirm and the ledger. Ledger and receipt-dialog layouts have no horizontal document/dialog overflow at 320, 390, 768, 1024 and 1440 pixels. Actual ownership/session and ledger mutations are verified separately through the API suite. A receipt download control is present; exported text was not separately reviewed in multiple browsers. No real payment or gateway refund was made.

Live collection, automatic gateway refunds, provider payouts, settlement reconciliation, tax invoices, recurring deposits and production multi-instance rate limiting remain outside this test milestone. Current payment actions are limited per server/IP; webhook logs and ledger data require ordinary deployment backups/monitoring. Windows/other browsers and a real merchant test-account journey remain unverified.

Official references:

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/api/orders/create/
- https://razorpay.com/docs/api/payments/fetch-with-id/
- https://razorpay.com/docs/webhooks/validate-test/

Main files: `server/src/payment-gateway.js`, `payments.js`, `models.js`, `app.js`, `server/test/payments.test.js`, `client/src/pages/Payments.jsx`/`.css`, the dashboard links and `scripts/demo.js`.
