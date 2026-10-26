# Two-stage payments: setup and review

This update preserves existing accounts and bookings. It does not enable live-money collection or provider payouts. Older bookings without a payment plan retain their optional-deposit behaviour and receipts; no new debt or start requirement is imposed on them.

## New-booking journey

New bookings created in `demo` or `razorpay_test` snapshot `DEPOSIT_BALANCE_V1`, mode, estimate and deposit in integer paise. The default INR 99 deposit is configurable with `PAYMENT_DEPOSIT_RUPEES` (integer rupees 1-500), capped at the starting estimate. Configuration changes do not change a saved plan. Bookings created with payments disabled retain the original workflow.

1. Professional accepts. Customer opens **Bills & payments** or the booking's **Bill, payments & receipts** action.
2. Customer pays deposit. A server-verified capture is required before the existing visit-OTP start transition. Payment does not replace acceptance or the OTP. Authorisation alone is insufficient.
3. Professional proposes any additional work/materials before completion. Customer approves each immutable proposal. After completion the professional submits itemised service charges and selected approved extras.
4. The server validates integer paise and calculates the total. Service charges cannot exceed the saved estimate; additions require separate approval. No tax is invented.
5. Customer approves the current bill or requests correction with a reason. Revisions preserve older versions and decisions. Approval records consent; a separate explicit payment action opens checkout.
6. Balance equals approved total less reconciled credits. Deposit and balance use different payment records/orders. Zero due opens no checkout. Excess credit enters refund review.
7. An outstanding balance order freezes its version, amount and credit snapshot. Retries reuse it. Uncertain creation never creates another order automatically. Changed credits require review; changes after freezing require administrator reconciliation.

Completion and collection remain separate. Collection never marks the professional paid out. Existing demo records cannot be converted to gateway payments by changing configuration.

## Existing database: explicit migration

The legacy unique `payments.booking_1` index prevents a second payment. Balance collection refuses until the replacement index is ready. Model initialisation can add the compound index but never drops the legacy index automatically.

Keep the existing `MONGODB_URI` in `server/.env`, check the target database, stop old application writers for the maintenance window, and retain your normal backup. Do not seed. From PowerShell:

```powershell
Set-Location C:\workspace\GharSeva-MERN
node scripts/migrate-payment-stages.js --dry-run
```

Preview prints the database, record count, missing-purpose backfill and exact index removal. It writes nothing. Prechecks reject duplicate booking/purpose pairs, invalid monetary/currency/purpose data and unexpected legacy index definitions. After reviewing the preview and retaining a backup, explicitly apply. Replace `gharseva` below with the exact database name in the preview and URI. Missing or mismatched confirmation is refused before connecting:

```powershell
node scripts/migrate-payment-stages.js --apply --confirm-db=gharseva
node scripts/migrate-payment-stages.js --dry-run
```

Apply fills only missing/null historical purposes with `VISIT_DEPOSIT`, creates unique `(booking,purpose)` first, then removes only the verified unique `booking_1` index. Receipt, order and transaction indexes remain. Repeating apply is safe. No collection is dropped; no account, booking, capture or receipt is reset. Custom, partial, sparse, hidden, reversed or conflicting compound index definitions require manual review before any write. Replica-set and Atlas URIs with explicit database names are supported. This script was not executed against your existing or external database during implementation.

## Classroom simulation

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run demo
```

The inspected launcher starts its own temporary MongoDB and forces `GHARSEVA_DEMO=true`, `AUTH_DELIVERY_MODE=test`, `PAYMENTS_MODE=demo`. It overrides `.env` settings. Use **Open deposit simulation** / **Open balance simulation**, then **Simulate success**, **Simulate failure** or **Cancel simulation**. Screens/receipts label simulation and no money movement. No card/UPI credentials are collected.

This launcher cannot activate Razorpay by editing `.env`. Do not restart an existing classroom session until ready to lose its temporary records. `npm.cmd run demo:accounts` shows existing demo account instructions. Never replace account emails to test login.

## Actual Razorpay TEST checkout

Use persistent MongoDB, existing verified accounts and server-only settings in `server/.env`. Keep credentials out of the client and source control. Configure your Razorpay TEST account:

```dotenv
# Retain your EXISTING database URI, stable JWT secret and other server settings.
GHARSEVA_DEMO=false
AUTH_DELIVERY_MODE=live
PAYMENTS_MODE=razorpay_test
PAYMENT_DEPOSIT_RUPEES=99
RAZORPAY_KEY_ID=rzp_test_<your-test-key-id>
RAZORPAY_KEY_SECRET=<your-test-key-secret>
RAZORPAY_WEBHOOK_SECRET=<your-test-webhook-secret>
```

Live `rzp_live_` keys are refused. Missing keys/webhook secret show setup instructions instead of a working Pay button. Gateway failures never silently use simulation. Keep the original payment mode configured for reconciliation of its existing bookings.

Password login still requires registered-email OTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and use an account whose inbox its owner can access. SMTP needs outbound connectivity; Render Free blocks ports 25/465/587. Existing Firebase/Apple settings and eligibility are unchanged. See the existing login setup documentation.

Run the migration preview/apply above for an existing payment collection, then start ordinary development:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run dev
```

Open `http://localhost:5173`; API is on port 5000. This ordinary launcher, rather than `npm.cmd run demo`, uses your configured Razorpay test settings. Built local review:

```powershell
npm.cmd run build
npm.cmd start
```

The server serves the built client on its configured port. These commands do not create gateway/SMTP accounts for you.

Configure a reachable HTTPS Razorpay TEST webhook ending in `/api/payments/webhook` with the matching secret. Subscribe to `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `refund.failed`. Local delivery needs an HTTPS tunnel or test host; none was created automatically. Configure test capture in Razorpay: authorised alone is not captured.

The adapter uses actual Standard Checkout and server Orders APIs for both stages. Verification checks checkout HMAC, stored order, authoritative order receipt/amount/currency, captured payments and refunds. Webhook signature verification uses raw request bytes before JSON parsing. Duplicate/out-of-order events fetch current gateway state. Unique references and conditional revisions prevent duplicate counting. Browser success/amount flags are not authoritative.

Official references:

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/best-practices/
- https://razorpay.com/docs/api/orders/fetch-with-id/
- https://razorpay.com/docs/api/refunds/fetch-multiple-refund-payment/

### Exact account-backed review

1. Create a **new** booking with an active approved professional and available slot while test payments are configured. Do not alter old bookings to manufacture a plan. Sign in as the assigned professional and accept it.
2. As customer open its payment action, check deposit consent and click **Pay deposit with Razorpay test**. Actual Standard Checkout should open. Use test instruments supplied by Razorpay documentation/dashboard, never live financial credentials.
3. Close/fail an attempt first: booking remains accepted and unpaid. Reconcile and retry the same order. Finish a test capture; verify its reference/status.
4. Professional moves on-the-way and starts with the customer's valid visit OTP. An unpaid new-plan booking must refuse start. Payment does not replace the OTP.
5. Propose extras before completion if needed; customer approves. Professional completes service and submits the itemised bill. Unapproved extras must be refused.
6. Customer requests correction with a reason. Professional revises. Customer checks version history and approves the current version.
7. Example arithmetic: INR 299 bill minus INR 99 deposit gives INR 200 balance. Click **Pay remaining balance with Razorpay test**. It must use a separate order and only the balance amount. Outstanding checkout freezes bill edits/competing orders. After capture total credit is INR 299, not INR 398; due is zero, service completed, payout not initiated.
8. Inspect combined references/receipts as customer, collection status as professional, and both ledger entries/bill history as admin. Check refreshes, duplicate callbacks and a 360 px keyboard review.

This walkthrough is a required configured review, not a claim that a gateway transaction was performed.

## Refunds and uncertain records

Cancellation preserves captures. No cancellation fee is introduced. A refund-review request records amount/reason but does not return money. Admin closure records its resolution without claiming a refund.

For Razorpay TEST refunds, issue the intended partial/full refund in its TEST dashboard, then use **Reconcile payment & refund status**. Requested/pending and processed refunds have separate states/records; only processed refunds reduce credit. Classroom admin can explicitly simulate refunds, clearly labelled as no money movement. The server supports partial simulation; the admin UI offers the remaining full refundable amount.

Pending refunds/reviews, mismatched capture/refund totals, multiple captures and overpayment block further collection. Interrupted simulation writes are repaired by reconciliation. Refunds cannot exceed captures. Post-settlement refunds preserve original settlement and never create a new customer debt or automatic charge.

If order creation times out, its record remains uncertain until its stable receipt resolves to an authoritative order. Never delete it to try another charge. If existence cannot be established, or credits change while a bill is frozen, administrator reconciliation is required. This milestone does not automate release of uncertain orders or edits to frozen bills. Large/unreadable gateway histories also stop collection for review.

## Changed files

- `server/src/models.js`: optional booking plan/billing, separate purposes/refund ledger and compound uniqueness.
- `server/src/billing-domain.js`, `server/src/billing.js`: paise validation, extras/decisions, bill versions, financial revisions and settlement snapshots.
- `server/src/payments.js`, `server/src/payment-gateway.js`: two stages, checkout, refunds, authoritative reconciliation, raw-signed events and scoped ledger/journeys.
- `server/src/app.js`: plan snapshot on new bookings and capture guard at visit start.
- `server/src/payment-indexes.js`, `scripts/migrate-payment-stages.js`: explicit restricted migration.
- `client/src/pages/Payments.jsx`, `client/src/pages/Payments.css`, `client/src/pages/Dashboard.jsx`: bill/payment/correction/receipt screens for all roles.
- `server/test/payment-stages-unit.test.js`, `server/test/payments.test.js`: handler and Mongo/HTTP regression coverage, including disposable migration fixture.
- `server/.env.example`, `docs/PAYMENTS-UPDATE.md`, this document: setup/review notes.

## Verification commands and limits

```powershell
node --test server/test/payment-stages-unit.test.js
node --test server/test/password-login-unit.test.js server/test/assistant-conversation-unit.test.js server/test/work-images.test.js
npm.cmd run build
npm.cmd test
```

Bounded diagnostics when needed:

```powershell
node --test --test-force-exit --test-timeout=45000 server/test/payments.test.js
node --test --test-force-exit --test-timeout=45000 server/test/*.test.js
```

Focused tests exercise actual handlers/validation/revision checks with mocked persistence and gateway data. These do not certify MongoDB atomicity or actual gateway integration. The HTTP suite uses temporary MongoDB, including a real-index fixture migration, and never the configured existing database.

### Actual results from this implementation

- Final focused run: **73 passed, 0 failed**: 26 two-stage payment handler/domain/adapter/migration tests plus 47 existing shared-login, assistant and work-image tests. The gateway/persistence data was mocked; no real transaction occurred. Cases include concurrent capture callbacks, changed credits, interrupted/competing refunds, zero/overpayment, historical start compatibility, forged financial fields, ownership, raw-signed duplicate events and delayed capture/refund discovery without new debt.
- Production build: **passed**, 1624 modules; no dependency changes.
- Bounded full regression attempt: **251 tests, 72 passed, 179 database setup/cleanup failures**, with local MongoDB connection `EACCES` (some older fixtures also report Windows Mongo process-start errors). This attempt preceded the final added delayed-capture refund test; the final focused run above includes it. The full suite did not pass.
- Dedicated current Mongo/HTTP payments suite: **25 tests blocked at setup**, `connect EACCES 127.0.0.1:<temporary-port>`. Actual Mongo uniqueness/migration behaviour and HTTP integration therefore remain unverified here. The migration was tested against temporary in-memory collection fixtures, and a disposable real-Mongo index test was added for a normal local run.
- Browser review used the actual React payment component with an isolated mock API fixture. Checked deposit failure/success, provider bill submission, correction, revision, approval and separate balance settlement at desktop and 360 px widths; admin controls/history, no horizontal overflow, keyboard focus containment, and missing credentials with no Pay button. The temporary fixture files were removed. This was not a connected booking/database or gateway journey.
- Compared the 142-file pre-edit baseline: no missing files; existing auth/shared navigation, OTP styling, provider images and assistant files unchanged. Runtime edits are limited to the payment milestone files listed above. No existing database was reset, reseeded or migrated.
- Still unverified: an actual Razorpay TEST transaction, account-backed checkout/capture, webhook delivery, actual partial/full gateway refunds, Mongo integration/index migration and host/network setup. Supply valid test credentials/webhook access and run the walkthrough before relying on the integration. No live collection or provider payout was activated.

Review screenshots from the isolated mock UI are in `.test-tmp/payment-stages-desktop.png` and `.test-tmp/payment-stages-mobile.png`. Diagnostic logs are in `.test-tmp/payment-final-passing-results.txt`, `.test-tmp/payment-http-results.txt`, `.test-tmp/payment-full-regression-results.txt` and `.test-tmp/payment-build-results.txt`.
