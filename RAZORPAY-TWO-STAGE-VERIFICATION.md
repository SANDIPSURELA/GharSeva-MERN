# Razorpay TEST two-stage verification — 27 October 2026

Local code milestone only. No push, deployment, Render/Razorpay settings change, hosted/shared database connection or migration, real email, gateway transaction, refund or payout was performed. Existing uncommitted milestone 1/2 work was preserved. Brevo account/sender setup and actual inbox delivery remain unverified.

## Diagnosis and implementation

The existing system already had server-created orders, Checkout HMAC verification against the saved order ID, authoritative payment/order/refund fetching, separate deposit/balance records, versioned customer-approved billing, visit-OTP gates, raw signed webhooks, revision-based concurrency and guarded index migration. It was extended, not replaced.

Confirmed gaps repaired:

- With payments disabled, new bookings previously had no payment plan and inherited historical optional-deposit behavior. All new bookings now save the existing required deposit/balance plan; a missing gateway cannot waive payment. Disabled-mode new bookings reserve Razorpay TEST policy. Existing no-plan historical bookings are untouched. The configured deposit is retained, validated as integer rupees 1–500 and capped at the trusted starting estimate; no percentage/fee was added.
- New-plan credit and reconciliation now validate payment booking/customer/provider, purpose, mode/currency/amount, approved bill revision and frozen balance amount/credit. Captures with invalid associations remain visible as unallocated capture under reconciliation; they cannot satisfy a stage.
- A webhook can recover an uncertain order through an authoritative order plus the saved unique receipt. Unmatched supported events remain unprocessed with diagnostic references, rather than being irreversibly marked processed. Admins have a read-only unresolved-events view.
- Late create-order responses cannot overwrite a capture already recorded by a webhook. Captured authoritative snapshots also outrank older authorized callback snapshots. Duplicate callbacks/events use the same settlement logic and atomic revisions.
- Checkout now awaits dismissal or server verification under one submission lock; early success callbacks are not swallowed by a nested lock. Duplicate handlers are ignored. Session changes/unmounts invalidate stale callbacks. Errors refresh persisted status without inventing success.
- Configuration validation is shared by runtime, production startup and the new strict no-charge readiness option. Live key IDs, malformed TEST settings/deposit, provider errors, ambiguous receipt lookups, invalid JSON and uncertain network responses fail safely. Gateway requests retain a 20-second timeout and refuse redirects.
- Public payment copy now describes required deposit after acceptance and approved remaining balance online. Historical optional-deposit text is confined to the historical workflow.

The existing conditional Razorpay CSP was inspected: TEST mode already permits the Checkout script and the relevant API/frame origins. No global CSP relaxation was made. Browser execution of Checkout remains unverified.

## Preserved state machine

| Event / stage         | Required evidence and result                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| New request           | Authenticated customer; authoritative provider/category/price; saved deposit policy; PENDING                                               |
| Provider accepts      | Only the assigned approved provider; deposit becomes eligible                                                                              |
| Deposit               | Owning customer explicitly consents; server order for saved deposit in integer paise                                                       |
| Start service         | Required confirmed deposit, provider permissions and existing visit/arrival OTP; authorization alone fails                                 |
| Extras                | Provider proposes immutable work/material items; customer approves before inclusion                                                        |
| Complete work         | Service COMPLETED is distinct from financial SETTLED                                                                                       |
| Final bill            | Versioned itemised service charges within estimate plus customer-approved extras; customer approves current version or requests correction |
| Balance               | Approved total minus valid reconciled credit; frozen bill version, credit and separate FINAL_BALANCE payment/order                         |
| Zero / overpayment    | No zero-value order; excess credit remains refund review, with no automatic refund                                                         |
| Capture / settlement  | Trusted order association, amount, INR, captured status and signature; not browser success or authorization                                |
| Cancellation / refund | Existing records/history/review retained; requested or pending refund is not returned money; provider payout remains NOT_INITIATED         |

Configuration changes never rewrite saved deposit amounts or turn simulation records into TEST gateway records. Existing historical no-plan bookings retain their original optional-deposit rules. No manually editable paid flags were added.

## Exact files changed for milestone 3

Earlier milestone files remain in the working diff. This list identifies this milestone's additions/edits.

| Files                                                                                                                      | Purpose                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| server/src/payment-gateway.js                                                                                              | Shared TEST readiness, bounded safe API handling, unambiguous receipt recovery                           |
| server/src/deployment.js                                                                                                   | Reuse readiness validation during production startup                                                     |
| server/src/billing-domain.js                                                                                               | Required new-booking snapshot; stage/ownership/bill credit validation; pending/unallocated ledger        |
| server/src/payments.js                                                                                                     | Atomic order binding, monotonic capture, recoverable webhook audit, admin read-only events               |
| server/src/models.js                                                                                                       | Optional webhook gateway references and processing-resolution fields                                     |
| shared/razorpay-checkout.js                                                                                                | Awaited Checkout lifecycle with session/duplicate/abort guards                                           |
| client/src/pages/Payments.jsx                                                                                              | Correct-stage Checkout, persisted-state refresh, ledger and unresolved admin events                      |
| client/src/pages/Booking.jsx, Home.jsx, Services.jsx, ProviderDetails.jsx, Dashboard.jsx, Public.jsx, ServiceAssistant.jsx | Consistent deposit/balance, approval and TEST copy                                                       |
| scripts/check-integrations.js                                                                                              | --payments-ready; no charge/message/write by default                                                     |
| scripts/migrate-payment-stages.js                                                                                          | Explicit autoCreate:false alongside autoIndex:false in operator migration connection                     |
| server/.env.example, server/.env.production.example                                                                        | Server-only settings, deposit preservation and readiness guidance                                        |
| server/test/payment-stages-unit.test.js                                                                                    | Actual handlers, crypto, billing, mocked gateway/storage races and stage guards                          |
| server/test/payment-gateway-unit.test.js                                                                                   | Adapter failures, strict configuration/CLI and startup consistency                                       |
| server/test/checkout-unit.test.js                                                                                          | Early/duplicate callbacks, dismissal, failure and session changes                                        |
| server/test/api.test.js, server/test/payments.test.js                                                                      | Connected-isolated-DB regressions for required deposit, OTP and two-stage gateway fixtures; blocked here |
| docs/PAYMENTS-TWO-STAGE-UPDATE.md, docs/PAYMENTS-UPDATE.md, docs/HOSTING-DEPLOYMENT.md                                     | Current-policy corrections and links                                                                     |
| RAZORPAY-TWO-STAGE-VERIFICATION.md                                                                                         | This handoff and evidence                                                                                |

Real server/.env, saved secrets, package-lock, existing startup command, payment/index migration policy, approvals, identity documents and database data were not changed for this milestone.

## Private TEST setup for the owner — not executed

Keep the existing production database URI, JWT_SECRET, IDENTITY_STORAGE_KEY, final HTTPS origin and Atlas access unchanged. First verify on an isolated local/staging database, never by redirecting tests to the hosted database. Keep private keys in server/.env locally or Render's private server environment; never VITE_* variables, source control, screenshots or chat.

Exact supported server settings:

| Variable                                                        | Value / handling                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                                                        | production on Render                                                                                                                   |
| AUTH_DELIVERY_MODE                                              | live                                                                                                                                   |
| GHARSEVA_DEMO                                                   | false                                                                                                                                  |
| PAYMENTS_MODE                                                   | razorpay_test, explicitly selected; disabled blocks checkout but preserves required new-booking stages                                 |
| PAYMENT_DEPOSIT_RUPEES                                          | Keep the existing configured integer value. 99 is only the application's existing new-installation default, not a required replacement |
| RAZORPAY_KEY_ID                                                 | Private environment entry containing the TEST public ID beginning rzp_test_; this ID alone is returned for Checkout                    |
| RAZORPAY_KEY_SECRET                                             | Matching TEST API secret, server only                                                                                                  |
| RAZORPAY_WEBHOOK_SECRET                                         | Independently chosen matching TEST webhook signing secret, server only                                                                 |
| EMAIL_TRANSPORT                                                 | brevo on Render Free                                                                                                                   |
| BREVO_API_KEY / EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME            | Existing milestone 1 private setup; verified sender; see docs/EMAIL-OTP-RENDER.md                                                      |
| MONGODB_URI / JWT_SECRET / IDENTITY_STORAGE_KEY / CLIENT_ORIGIN | Preserve existing stable production values; isolated staging must have its own explicit database and environment                       |

Keep this Render start command:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

The normal start process connects to its configured database and initializes declared model indexes; it does not drop the legacy unique booking index, migrate payment purposes, seed catalog/users, or reset records. Production startup refuses unsafe TEST configuration. Email warnings do not silently enable demo authentication.

From the project root, before starting/redeploying:

```powershell
npm.cmd run integrations:check
npm.cmd run integrations:check -- --payments-ready
npm.cmd run integrations:check -- --email-ready
```

Default and strict checks validate configuration only: no gateway credential probe, message, order, payment or database write. A strict failure returns nonzero. A pass does not prove valid credentials, capture, delivered webhook or settlement.

In the Razorpay TEST dashboard, the owner must privately generate/retrieve TEST keys and choose **Account & Settings → Payment Capture → Automatic Capture** for the intended sandbox demonstration. Confirm TEST capture settings in that account. The application does not call the capture API and never treats authorized as captured. If authorization persists, show pending and refresh/reconcile; investigate account settings instead of manually marking it paid.

Use the actual HTTPS webhook URL:

```text
https://YOUR-ACTUAL-STAGING-HOST/api/payments/webhook
```

For a later explicitly approved hosted setup, the current site path would be:

```text
https://gharseva-mern.onrender.com/api/payments/webhook
```

Only use an endpoint whose application environment points at the intended isolated test dataset for this milestone. Do not send an isolated test's events into the shared hosted dataset.

Subscribe in TEST mode to payment.captured, payment.authorized, payment.failed, order.paid, refund.created, refund.processed and refund.failed. Enter the identical webhook signing secret privately on both sides. A public reachable HTTPS endpoint is required; localhost is not a delivered-webhook test. Follow Razorpay's current endpoint restrictions rather than assuming an arbitrary tunnel works. No public endpoint or subscription was created here.

Original request bytes are verified with HMAC SHA256 before parsing. Only /api/payments/webhook uses the raw parser and bypasses the normal application CSRF route protection. Normal authenticated mutations retain origin/context/role checks. Unsupported events are ignored without settlement.

## Uncertain outcomes and replay

Close/cancel/failure do not cancel the booking or prove nonpayment. Refresh **Bill, payments & receipts** and use its **Reconcile** action. READY/FAILED can reuse the saved order after reconciliation. AUTHORIZED remains pending. A timed-out create remains recoverable through its unique saved receipt; the application will not automatically make a second order. Ambiguous orders, missing authoritative attempts or changed credits block collection for review.

Admins can inspect unresolved webhook references in **Bills & payments**. A 202 reconciliation-required response records an unresolved event without processedAt; Razorpay may regard 202 as accepted, so do not rely on automatic redelivery. After establishing the correct stored order/receipt and approved bill, reconcile the booking and have the owner resend the original TEST event from the gateway's supported dashboard facility. Keep event ID and body intact. Invalid signature/body-ID reuse is rejected; failed application writes remain replayable. No paid-flag editing or arbitrary reassignment is an acceptable repair. Legitimately captured but unmatched/superseded records must stay under audited review; do not issue an automatic refund.

## Legacy payment index migration — later operator use only

No dry run or apply was executed against any shared/hosted database. No indexes were changed at startup as part of this repair. The migration's existing fixture tests verify dry-run no-writes, guarded repeated apply, history preservation and refusal of unexpected/custom indexes.

In a private operator environment already configured for the deliberately reviewed target, retain a backup and stop competing old writers before apply:

```powershell
node scripts/migrate-payment-stages.js --dry-run
node scripts/migrate-payment-stages.js --apply --confirm-db=EXACT_DATABASE_NAME
node scripts/migrate-payment-stages.js --dry-run
```

Replace EXACT_DATABASE_NAME with the exact reviewed name, not an assumed default. Default/no flag is read-only. Apply requires exact database confirmation before connecting. Never substitute the hosted URI into automated tests.

Illustrative fixture preview, not an observation of your database:

```json
{
  "collection": "payments",
  "records": 1,
  "backfill": 1,
  "dropOnly": ["booking_1"],
  "create": "payment_booking_purpose",
  "apply": false,
  "ready": false
}
```

Apply backfills only missing/null purpose to VISIT_DEPOSIT, creates and verifies unique (booking,purpose), then drops only the verified obsolete unique booking_1. It preserves IDs, accounts, bookings, orders, receipts, refunds and history. Custom/partial/sparse/hidden/reversed/conflicting indexes, duplicates or invalid monetary data require review before any write. It does not drop collections or seed users. An unmet index prerequisite blocks balance collection.

## Isolated test setup and faculty walkthrough

Automated tests use scripts/isolated-mongo.js: mongodb-memory-server 7.0.24, unique gharseva_test_* databases/workspace paths, explicit loopback, bounded connection timeouts and cleanup. They never load the hosted URI as fallback. On a normal workstation with supported Node 22.12–24 and permitted loopback:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run test:db
npm.cmd test
```

No dependency upgrade is required for this milestone. Use a supported environment allowing its own loopback connection; do not disable antivirus/TLS/browser security to force success. A container/VM with Node and permitted local MongoDB is an alternative. The test helper already handles Windows arguments, isolated paths, startup and connection cleanup; changing Atlas access or using the hosted database will not fix this environment's local socket denial.

For a real TEST Checkout review, use a separate persistent local MongoDB or separately provisioned staging database with a clearly isolated gharseva_demo_* / gharseva_test_* name. Configure that process's MONGODB_URI privately, not the production service. Use the guarded catalog command from CATALOG-AHMEDABAD-REPAIR.md as necessary; do not run destructive seed. Set the TEST payment settings and live email settings above, then npm.cmd run dev for the ordinary application (or build/start in its own isolated environment). Existing normal startup validates settings and creates declared indexes. Do not use npm.cmd run demo for a Razorpay claim: that launcher explicitly forces classroom authentication and simulated payments.

Use newly prepared, authorized isolated accounts with inboxes their operators control and the normal role/approval workflow. Do not repoint or promote real/shared accounts or fabricate real identity evidence. Fictional expansion accounts in ignored .test-tmp/demo-accounts.local.md have test-only addresses and cannot receive real OTP; the classroom launcher is only an explicitly labelled simulation. The earlier .test-tmp/catalog-fixture-accounts.local.md is fixture documentation, not proof of connected accounts or live login.

Faculty walkthrough once those prerequisites are actually satisfied:

1. Log in as customer/provider/admin in separate browser profiles using password and stored-email OTP. Select the customer's saved city, an enabled category, an approved available provider and appointment; submit a new request.
2. Assigned provider accepts; another provider/customer cannot mutate it. Customer opens its saved payment journey. Before deposit, demonstrate the work-start gate.
3. Review the saved deposit and TEST label. First dismiss Checkout and refresh; then use only Razorpay's official TEST success/failure details in its sandbox to demonstrate refusal and success. Never use personal payment credentials or collect money.
4. Confirm authoritative CAPTURED deposit after refresh, matching order/payment/receipt. AUTHORIZED remains pending. Provider then completes the existing arrival/visit OTP workflow before work.
5. Propose any extras before completion and obtain customer approval. Mark work completed; show that financial settlement is still pending. Submit itemised bill; demonstrate correction if needed, then approve the current version.
6. Show approved total, valid deposit credit and computed remaining amount. Pay the separate FINAL_BALANCE TEST order; refresh all three role views. Confirm two distinct receipts/orders and one settlement, with provider payout NOT_INITIATED.
7. On an isolated zero-due fixture, no second order opens. On overpayment, show refund review without refunding. Do not change prices/deposit or mark unpaid paid to manufacture these examples.
8. Deliver signed TEST webhook notifications to the isolated staging endpoint; verify repeated notifications/callback races do not duplicate credit. Record only redacted references/status and test case outcomes, not keys, OTPs or payment details.

## Validation evidence and limits

Command logs are ignored local files under .test-tmp/razorpay-*.log. They contain mocked/isolated diagnostics, not credentials or live OTPs.

| Actual command/check                                                                                                                                                      | Actual result                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| node --test server/test/payment-stages-unit.test.js server/test/payment-gateway-unit.test.js server/test/payment-migration-unit.test.js server/test/checkout-unit.test.js | 58 passed, 0 failed, exit 0; mocked persistence/providers, real handlers/crypto               |
| Preservation command below                                                                                                                                                | 187 passed, 0 failed, exit 0 at that run; later additions are also included in final full run |
| npm.cmd test, final run                                                                                                                                                   | Build passed; 373 tests: 192 passed, 181 setup failures, 0 skipped; exit 1                    |
| Production build inside npm.cmd test                                                                                                                                      | Passed using Vite production build                                                            |
| npm.cmd run test:db                                                                                                                                                       | MongoDB process started; connection blocked by connect EACCES; exit 1                         |
| node scripts/check-integrations.js --payments-ready, actual local configuration                                                                                           | Correctly failed, exit 1: no selected/configured TEST keys/webhook; no provider request       |
| npm.cmd run integrations:check                                                                                                                                            | Passed diagnostic execution, exit 0; correctly reports missing/unverified integrations        |
| git diff --check                                                                                                                                                          | Passed; existing line-ending warnings only                                                    |

The full suite's previous 179 MongoDB setup failures remain. Two new connected-database regressions also fail in that same setup hook, producing 181 blocked checks, not a claim of new business-rule assertion failures. The 192 passed checks include the final new configuration, signature, Checkout and race tests.

Actual preservation command:

```powershell
node --test server/test/assistant-conversation-unit.test.js server/test/brevo-email-unit.test.js server/test/catalog-reconciliation-unit.test.js server/test/checkout-unit.test.js server/test/city-demo.test.js server/test/email-delivery-unit.test.js server/test/external-auth-unit.test.js server/test/isolated-mongo-unit.test.js server/test/password-login-unit.test.js server/test/payment-gateway-unit.test.js server/test/payment-migration-unit.test.js server/test/payment-stages-unit.test.js server/test/session-security-unit.test.js server/test/work-images.test.js
```

The connected tests now explicitly exercise the required deposit before the visit OTP and the two-stage gateway-fixture/bill/role-view/webhook flow against MongoDB when an isolated connection is available. Their assertions did not execute successfully in this environment.

The earliest database failure was MongooseServerSelectionError caused by connect EACCES 127.0.0.1 on the unique local MongoDB port. The MongoDB child process started. An independent Node net server also bound locally, then its own client failed with code EACCES, syscall connect. This reproduces the problem outside Mongoose, application handlers, .env and database credentials; it is a local environment/socket-access blocker, not proof of 179 application defects. No system-security change was made.

Computer-use inventory succeeded, but the local UI-only server (no database connection, payments disabled) could not be opened at either http://localhost:5081 or http://127.0.0.1:5081: browser net::ERR_CONNECTION_TIMED_OUT. The review server was stopped. No browser customer/provider flow or actual gateway Checkout was completed.

| Evidence level                                                                                 | Status                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Adapter fixtures, real crypto/business handlers with mocked storage, fake Checkout constructor | Verified by automated checks; not external provider/database integration |
| Connected isolated MongoDB booking/payment tests                                               | Blocked by EACCES; not passed                                            |
| Actual Razorpay TEST Checkout / capture                                                        | Unverified; no configured TEST keys and no connected isolated dataset    |
| Delivered TEST webhooks                                                                        | Unverified; no configured public isolated endpoint or gateway secret     |
| Brevo sender setup and actual email receipt                                                    | Pending/unverified                                                       |
| Hosted catalog/providers and two-stage demonstration                                           | Unverified; no shared data initialization or deployment                  |
| Live money, refunds, provider payouts                                                          | Not enabled or tested                                                    |

## Pending audit work

Owner-controlled Brevo setup/inbox test; catalog reconciliation and approved Ahmedabad data review for the hosted environment; real Razorpay TEST credentials/capture/Checkout/webhook verification on isolated data; later approved deployment; social sign-in; dependency updates. This milestone corrects payment copy but does not claim the entire website is fixed or the external integrations work.

## Primary references checked

- [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) — server orders, stored-order HMAC verification and official Checkout script.
- [Webhook validation/testing](https://razorpay.com/docs/webhooks/validate-test/) — original bytes, event IDs, duplicates, ordering and public endpoint restrictions.
- [Capture settings](https://razorpay.com/docs/payments/payments/capture-settings/) — authorization versus capture and account capture settings.
- [Fetch orders](https://razorpay.com/docs/api/orders/fetch-all/) — receipt-filtered reconciliation; the application rejects ambiguous results rather than assuming gateway idempotency.
