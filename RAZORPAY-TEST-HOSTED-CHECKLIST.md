# Razorpay TEST hosted checklist — 27 October 2026

**Implemented:** Existing deposit/balance payment flow, TEST Checkout, server verification and signed raw-body webhook. Inspection found no demonstrated payment defect requiring a code change. The only file created in this task is this checklist. Existing local social, assistant and other changes are preserved.

**Locally tested:** 124 focused tests passed with mocked repositories/gateways and pure logic. Production build and git diff --check passed. These are not connected-database or real-gateway tests.

**Externally configured:** Local payment readiness is disabled and TEST credentials are missing or malformed. Hosted payment options, catalog and provider availability could not be retrieved through the available read-only tool and remain unknown. Owner reports hosted email OTP registration, login and recovery succeeded.

**Actually verified:** No actual Razorpay TEST Checkout, capture, delivered webhook or live-money transaction was performed here. Current local HEAD is 26987f4; this does not establish which commit Render is running.

## Private TEST setup

Switch the Razorpay Dashboard to TEST mode. Use its API Keys section to generate a TEST key pair. Store the secret privately when shown; use the provider's supported regeneration process if needed. Never paste secrets into chat, files, screenshots or URLs.

On the existing Render service Environment page set:

| Variable                | Value                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PAYMENTS_MODE           | razorpay_test                                                                                                                                 |
| RAZORPAY_KEY_ID         | Public TEST key ID beginning rzp_test_ (the server supplies this to Checkout)                                                                 |
| RAZORPAY_KEY_SECRET     | Matching TEST key secret, server only                                                                                                         |
| RAZORPAY_WEBHOOK_SECRET | Separate owner-chosen secret; exactly match the Razorpay TEST webhook signing secret                                                          |
| PAYMENT_DEPOSIT_RUPEES  | Keep existing configured integer 1–500; if unset the code defaults to 99, capped at the estimate. Existing bookings keep their saved amounts. |
| NODE_ENV                | production                                                                                                                                    |
| AUTH_DELIVERY_MODE      | live                                                                                                                                          |
| GHARSEVA_DEMO           | false                                                                                                                                         |

Never use VITE variables for secrets. Preserve Brevo settings, existing database URI, JWT secret, identity-storage key, Atlas access and final HTTPS origin. Keep the Render start command:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

Create the TEST webhook at https://gharseva-mern.onrender.com/api/payments/webhook with the same separately chosen signing secret. The implemented event subscriptions are:

- payment.authorized: record pending authorization, not a confirmed deposit.
- payment.captured: reconcile capture and the correct stage.
- payment.failed: reconcile failures and retry state.
- order.paid: reconcile the order and its captured payment.
- refund.created, refund.processed, refund.failed: reconcile existing refunds; subscribing does not issue one.

Enable automatic capture in the TEST account's current payment capture settings. This integration does not call the capture API. An authorized but uncaptured payment stays pending and cannot unlock work.

The webhook verifies the original request bytes before processing, then retrieves authoritative gateway details. Razorpay references:
https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
https://razorpay.com/docs/webhooks/validate-test/

On a machine with its intended private server/.env:

```powershell
cd C:\workspace\GharSeva-MERN
npm.cmd run integrations:check -- --payments-ready
```

This checks configuration syntax only; it does not contact Razorpay, validate credentials, create an order or prove capture/webhook delivery. Its local failure does not prove Render is misconfigured. After privately saving settings, deploy an explicitly reviewed commit using the service's normal deployment workflow. Confirm Render Events/Deploys reports Live for the expected commit SHA. The public /api/payments/options should show enabled and razorpay_test, which remains a configuration flag rather than proof of payment.

## Prerequisites and legacy index

Confirm the hosted catalog contains an enabled relevant service and the Ahmedabad provider is active, approved, available, offers it and can log in with an authorized inbox. These were not verified here. If missing, follow the guarded dry run and review instructions in CATALOG-AHMEDABAD-REPAIR.md. Demo expansion is limited to isolated demo environments: do not bypass production safeguards or approve real providers automatically.

A legacy unique booking-only payment index may block a second stage; whether the hosted database needs a migration is unknown. A trusted operator should back up and identify the target database privately, then run:

```powershell
node scripts/migrate-payment-stages.js --dry-run
```

If the plan shows an index upgrade is needed, review conflicts and authorize writes, stop competing old writers, and then use the exact target database name:

```powershell
node scripts/migrate-payment-stages.js --apply --confirm-db=EXACT_DATABASE_NAME
node scripts/migrate-payment-stages.js --dry-run
```

The confirmation must match the explicit application database name in the privately configured MONGODB_URI. Do not share the URI. Unexpected indexes or duplicate/invalid records require manual review. No migration or hosted database access occurred in this task.

## Owner-run faculty walkthrough

Use separately authenticated browser profiles for authorized customer, assigned provider and admin. Test bookings will be written to the configured hosted dataset; create only ones the owner authorizes. Use Razorpay's official TEST payment details, never real cards. Keep OTPs and private data out of reports.

1. Customer signs in with email OTP, chooses saved Ahmedabad city, an enabled service, approved professional and available time, enters a test address and submits the request. Record the booking reference.
2. Assigned provider accepts. A different provider must not be able to accept.
3. Before deposit, attempt the normal visit-start flow. The unpaid required deposit must block work. Do not bypass the gate or disclose the visit OTP.
4. Customer opens Bill, payments & receipts, checks TEST mode, starts the deposit then closes Checkout. Refresh/reconcile: it stays unpaid and allows safe retry. Retry using official TEST details.
5. Refresh the app and inspect the Razorpay TEST Dashboard. Confirm a captured INR deposit matching the booking/order/amount and its separate receipt. Authorization alone stays pending. Compare customer/provider views.
6. Provider starts the visit only after captured deposit and normal visit verification, then completes work. Provider submits a final bill; customer reviews and approves the version and applicable extras.
7. Customer pays the separate approved remaining balance in TEST Checkout. Check approved total less deposit credited equals the second captured INR order; compare both order IDs and receipts. Zero balance creates no order. Overpayment follows existing refund review; do not issue a refund for this demonstration.
8. Admin views the booking and payments under existing role permissions. Refresh each view. TEST receipts do not establish live-money collection or provider payout.

For webhook proof, use Razorpay TEST webhook event/delivery details to match the actual transaction, URL, event ID, timestamp and response. The normal processed response is HTTP 200 with {"ok":true}; 200 with ignored or duplicate has a different meaning. HTTP 202 with reconciliationRequired is unresolved, not successful settlement. A WEBHOOK entry in the payment history can show a change, but may be absent if the callback won the race. The admin unresolved list contains only unprocessed events; its being empty alone does not prove delivery. For definitive proof an authorized operator can privately inspect corresponding PaymentEvent metadata (eventKey, event, resolution, processedAt and payment reference): PROCESSED with processedAt, matched to the gateway delivery and correct ledger, shows application processing. Do not share payloads or secrets.

## Troubleshooting

- Disabled Checkout: privately check mode, key format, secrets, Render startup and deployed SHA. Preserve Brevo configuration.
- Closed/uncertain Checkout: reconcile saved status before retrying the same order; do not create repeated orders.
- Authorized but not captured: inspect TEST capture settings; reconcile. Do not manually mark paid.
- Invalid webhook signature: verify the separate matching secret and exact route privately.
- 202/unresolved: inspect admin unresolved events and reconcile the stored order and bill before using Razorpay's supported TEST replay. A 202 may be treated as delivered by Razorpay; it is not processing proof.
- Index review message: use the guarded dry run, never force changes on an unconfirmed target.
- Browser/CSP failure: record the exact blocked directive/domain without secrets. Existing conditional Razorpay CSP is present; actual browser completion remains unverified.

## Commands and results

```powershell
node --test server/test/payment-gateway-unit.test.js server/test/payment-migration-unit.test.js server/test/payment-stages-unit.test.js server/test/checkout-unit.test.js server/test/password-login-unit.test.js server/test/brevo-email-unit.test.js server/test/session-security-unit.test.js
npm.cmd run build
git diff --check
node scripts/check-integrations.js --payments-ready
```

124 tests passed, zero failed or skipped. They cover signature/association/owner checks, pending capture, duplicate and out-of-order events, cancellation/retry, work and balance gates, and zero/overpayment behavior with fixtures. Build and diff check passed. Local readiness exited 1 with payments disabled and missing/malformed TEST settings. The earlier isolated MongoDB readiness check failed with connect EACCES; connected tests and the full suite were not rerun here. No browser flow was run.
