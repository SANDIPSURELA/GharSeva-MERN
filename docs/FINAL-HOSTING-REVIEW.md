> **Email update, 27 October 2026:** the later [Render email milestone](EMAIL-OTP-RENDER.md) adds Brevo HTTPS and supersedes SMTP-only setup advice here. Earlier results below remain historical; no actual inbox delivery is implied.

# Final hosting review - 26 October 2026

**Not ready for hosting sign-off.** The code fixes and independent tests below are complete. Actual email receipt, Google/Apple authentication, Razorpay TEST deposits/balances, gateway-delivered webhooks, real MongoDB migration and browser demonstration are still blocked/unverified. No existing database was changed, seeded, reset or migrated. No live collection/payouts, publication, purchases, new external accounts or ZIP were created.

## Source and configuration inspected

The working folder `C:\workspace\GharSeva-MERN` is the source of truth. No applicable AGENTS.md was found under it or its parents. The supplied project-mirror instruction leaves `sources/` read-only. No separately identified reviewed-changes patch was available. Two older project ZIPs in the workspace were not treated as patches or copied over this folder. This folder has no Git metadata, so a 165-file hash baseline was recorded before edits; no baseline file was removed. The dependency lockfile, models, session implementation, OTP CSS, city filtering, professional images, assistant and booking/payment rules remain unchanged.

Node was **24.13.1**, npm **11.8.0**, within package engines `>=22.12.0 <25`. The deployment pin `.node-version` is **24.22.1**; that exact pinned runtime was not available/tested here. Existing node_modules were used. No dependency upgrades, downgrades, lockfile removal or audit force-fix were performed.

`server/.env`, `client/.env` and root `.env` are absent. Required integration credentials were also absent from the execution environment. Values were not printed. Consequently there is no configured Razorpay TEST account, SMTP destination, Firebase project/service account, intended persistent database or final domain available to this review.

## Confirmed fixes

- Payment migration now requires `--apply --confirm-db=EXACT_DATABASE_NAME`, an explicit application database in the URI, and a second check against the actual connected collection database. Missing/wrong confirmation is refused before connection. Parsing uses the MongoDB driver's parser, retaining Atlas/replica-set support. Reserved/default implicit targets are refused. Dry-run remains read-only.
- Custom, conflicting, partial, sparse, hidden or reversed compound indexes require review before any write. Only the verified obsolete unique `booking_1` can be removed, after verifying the complete replacement unique booking/purpose index. A valid existing equivalent index is reused. Backfill changes only missing/null purposes; capture, receipt and history values are preserved. Maintenance/backup is still required: this is not an all-or-nothing multi-operation migration.
- SMTP validates port/settings, enforces TLS/STARTTLS and bounded connection/greeting/socket timeouts. A send must report acceptance of the intended recipient; rejection/transport errors fail without authentication or a displayed live code. Acceptance is not proof of inbox delivery.
- Added a secret-safe integration diagnostic. Its optional SMTP check sends **no message** and cannot claim delivery.
- Google/Apple popup failures now explain cancellation, blocked popups, domain/setup errors, network failures and account conflicts. A user-triggered recovery action checks an existing Firebase redirect result and sends it for normal server verification. No redirect is silently initiated, no account is linked by email, and the SDK token remains in memory with sign-out cleanup.
- Corrected stale registration instructions describing password-only admin login/standalone code login, guarded migration commands, and marked older verification reports historical.

## Verification table

| Area | Automated/code evidence | Actual external/browser evidence |
| --- | --- | --- |
| Email OTP | Shared email/mobile password handlers, stored destination, expiry, resend, attempts, replay/concurrency, delivery failure and account-change tests pass with mocks; 6 SMTP-adapter tests pass | No SMTP connection or message; no owner-confirmed inbox receipt |
| Google | UID mapping, role/suspension/linking policies covered by existing mocked handler tests; popup/recovery tests pass | Firebase configuration absent; no Google account selection/sign-in |
| Apple | Same policies, relay consent/name preservation inspected; popup/recovery tests pass | Apple/Firebase credentials/domain setup absent; no Apple sign-in |
| Booking | Existing handler/assistant/city/image regression tests pass with mocked persistence | Complete customer/provider/admin browser journey and real availability conflicts blocked |
| Deposit | Captured-only guard, server amounts, ownership, uncertain/retry handling and signatures pass with mocked gateway | No Razorpay order/payment created; no Standard Checkout transaction |
| Final balance | Separate order/record, approved bill, correction, credit deduction, zero/overpayment and concurrency tests pass | No actual balance capture/receipt reconciliation |
| Webhooks | Raw-byte HMAC, duplicate/out-of-order reconciliation tested with mock gateway | No reachable authorised endpoint; no Razorpay-delivered event |
| Migration | 10 unit/CLI safeguard tests pass; real disposable-Mongo preservation/refusal tests added/adapted | Disposable Mongo connection denied; saved-database dry-run stopped because URI absent; no apply |
| Sessions | 26 middleware/client tests pass, including revocation, independent devices, stale responses/forms, tab signals, idle/absolute expiry and sensitive admin OTP | Real two-tab/profile/isolated-browser checks blocked |
| Dependencies | Installed production dependency tree resolves | Fresh audit failed at registry DNS; present advisories/severity totals unknown |

Server Firebase verification still uses `verifyIdToken(idToken, true)` before provider/UID binding, enabled-provider, verified-email and recent-auth checks. Firebase Admin validates signatures, issuer, audience and expiry; the tests here do not replace a configured SDK/service integration test. Public onboarding cannot make an admin or approve a professional. Linked sign-in preserves stored roles, contacts, names and approval. Linking requires completed local authentication and current password, plus relay consent where applicable.

The payment adapter still creates orders server-side, verifies checkout HMAC and authoritative order/payment amount, INR currency, references and captured status, and refuses live keys. An authorised-only payment is not a capture. Bill approval and service completion remain separate from collection; provider payout remains NOT_INITIATED. No external references can be recorded because no external transaction occurred.

## Exact commands executed and results

From `C:\workspace\GharSeva-MERN`:

```powershell
npm.cmd audit --json
npm.cmd ls --all --omit=dev
npm.cmd ls firebase firebase-admin @firebase/firestore @google-cloud/firestore protobufjs @grpc/grpc-js google-gax --all
npm.cmd test
node --test --test-force-exit --test-timeout=45000 server/test/payments.test.js
node --test server/test/payment-migration-unit.test.js server/test/payment-stages-unit.test.js server/test/email-delivery-unit.test.js server/test/external-auth-unit.test.js server/test/password-login-unit.test.js server/test/session-security-unit.test.js server/test/assistant-conversation-unit.test.js server/test/city-demo.test.js server/test/work-images.test.js
node --test --test-force-exit --test-timeout=45000 server/test/*.test.js
npm.cmd run build
npm.cmd run integrations:check
npm.cmd run integrations:check -- --smtp-connect
npm.cmd run deploy:check
node scripts/migrate-payment-stages.js --dry-run
npm.cmd start
npm.cmd run dev -w client
```

- **137/137 focused tests passed**, zero failures/skips. Persistence, AI, email and gateway responses are mocked where used.
- Initial `npm.cmd test`: build passed, **297 tests: 115 passed, 182 database setup/cleanup failures** (temporary Mongo startup problems).
- Final ordinary `npm.cmd test`: build passed, then stalled after database setup failures; stopped that owned test process. Reran with the explicit timeout/force-exit command above using `TEMP`/`TMP` set to `.test-tmp`: **320 tests: 137 passed, 183 database setup/cleanup/timeout failures**. Local `connect EACCES 127.0.0.1:<temporary-port>` is the blocker; no assertion failure appeared in the final bounded log. This is **not a passing full suite**.
- Dedicated initial Mongo payments attempt: **25 tests blocked**, same EACCES; subsequent added disposable migration test is included in the final full count.
- Separate final production build **passed**, Vite 8.3.2, 1629 modules. Syntax check and Prettier completed for edited JavaScript/JSX.
- Integration diagnostic ran, reporting missing setup. SMTP connection option **refused missing live-mode configuration**, sending no message. Deployment validation and ordinary startup **failed as expected on absent required settings**. Saved-database migration dry-run **refused absent MONGODB_URI before connecting**.
- Fresh npm audit **failed**: `ENOTFOUND registry.npmjs.org` at the audit endpoint. Installed Firebase 13.1.0 and firebase-admin 14.5.0 still include Firestore dependencies. The application imports Firebase App/Auth, but that does not clear transitive vulnerabilities. Dependency tree inspection passed; no current severity count or remediation success is claimed. Retry the audit with registry access before release; investigate its specific advisories rather than force-fixing/downgrading Firebase.
- Vite started for browser review. In-app browser navigation to `http://localhost:5173/login` failed `ERR_CONNECTION_TIMED_OUT`; no login/OTP/payment rendering or role/profile demonstration was verified. The temporary frontend process was stopped. No firewall, origin, approval or security setting was weakened.

Logs are in `.test-tmp/final-review-focused.txt`, `final-review-initial-tests.txt`, `final-review-full-tests.txt` (interrupted), `final-review-bounded-tests.txt`, `final-review-payments-mongo.txt`, `final-review-build.txt`, `review-audit.json`, `final-review-config.txt`, `final-review-deploy-check.txt`, `final-review-smtp-check.txt`, `final-review-start.txt`, and `final-review-saved-db-dry-run.txt`.

## Files changed

| Files | Reason |
| --- | --- |
| `server/src/payment-indexes.js`, new `server/src/payment-migration-target.js`, `scripts/migrate-payment-stages.js` | Guarded target, read-only preview, stricter index review and verification |
| `server/src/identity-services.js` | SMTP configuration, acceptance and diagnostic handling |
| new `shared/external-auth.js`, `client/src/components/ContactVerification.jsx` | Tested Firebase popup/recovery adapter and actionable error states |
| new `scripts/check-integrations.js`, `package.json`, `server/.env.example` | Secret-safe diagnostic command and setup comments; dependency declarations/lockfile unchanged |
| new `server/test/payment-migration-unit.test.js`, `email-delivery-unit.test.js`, `external-auth-unit.test.js` | 22 new independent regression checks |
| `server/test/payment-stages-unit.test.js`, `server/test/payments.test.js` | Intentional migration contract update and actual disposable-Mongo safeguards |
| `docs/PAYMENTS-TWO-STAGE-UPDATE.md`, `REGISTRATION-INTEGRATION-SETUP.md`, `DEPLOYMENT-VERIFICATION.md`, `VERIFICATION.md`, this report | Correct commands/current contract, historical-result labels and current evidence |

## Smallest missing configuration and exact startup

Fill **server/.env privately**, or equivalent host secret settings; never paste keys/passwords into chat, client files or this report. Retain existing database/secret values. Do not replace fictional demo account emails to manufacture an email test.

| Purpose | Exact server environment names / account steps |
| --- | --- |
| Persistent app | `MONGODB_URI` with the intended explicit database, stable `JWT_SECRET`, matching existing `IDENTITY_STORAGE_KEY`; `CLIENT_ORIGIN=http://localhost:5173` locally; `NODE_ENV=development` |
| Real email | `AUTH_DELIVERY_MODE=live`, `GHARSEVA_DEMO=false`, `SMTP_HOST`, `SMTP_PORT` (normally 587 STARTTLS or 465 TLS), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; verify sender/domain and allowed outbound SMTP |
| Google/Apple common | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN` (hostname, no scheme/path); either `GOOGLE_APPLICATION_CREDENTIALS` pointing to a private service-account JSON outside the project, or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` |
| Google | `AUTH_GOOGLE_ENABLED=true`; enable Google provider/support email in Firebase. Add localhost and the final app hostname to Firebase Authentication authorised domains. Match the OAuth client's callback to `https://<FIREBASE_AUTH_DOMAIN>/__/auth/handler` as shown in Firebase. New projects may need localhost added explicitly |
| Apple | `AUTH_APPLE_ENABLED=true`; configure an Apple Developer Services ID associated with a Sign-in-enabled primary App ID. Set web domains/return URL `https://<FIREBASE_AUTH_DOMAIN>/__/auth/handler`. Enter Services ID, Team ID, Key ID and Apple private signing key in **Firebase's Apple provider settings**, not React/server public configuration. Register the app's SMTP sender/domain with Apple's private email relay; retain consent and test forwarding |
| Razorpay TEST only | `PAYMENTS_MODE=razorpay_test`, `PAYMENT_DEPOSIT_RUPEES=99`, `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; enable automatic test capture in Razorpay and verify captured status. No live keys/payouts |

Twilio/OpenAI keys are not needed for password-then-email-OTP login, linked social login or guided assistant booking. A mobile password-login identifier still receives its code at the account's **stored email**, not SMS.

Use separate real test accounts with inboxes explicitly authorised by their owners, through normal registration/invitations. Only initiate mail to those configured recipients. A connection or SMTP acceptance does not confirm delivery: the owner must see the message and complete login. Record the outcome without logging OTP/message contents.

```powershell
Set-Location C:\workspace\GharSeva-MERN
# Create server/.env from the example only if absent, then fill privately.
# Preserve existing .env/database/secrets; do not seed.
npm.cmd run integrations:check
npm.cmd run integrations:check -- --smtp-connect
node scripts/migrate-payment-stages.js --dry-run
npm.cmd run dev
```

Open `http://localhost:5173/login`. For built local review, use `npm.cmd run build` then `npm.cmd start` with `CLIENT_ORIGIN=http://localhost:5000` if that is the origin/port used. A same-origin app/API deployment is the supported production shape.

`npm.cmd run demo` is a **different**, temporary classroom launcher. It forces `GHARSEVA_DEMO=true`, `AUTH_DELIVERY_MODE=test`, `PAYMENTS_MODE=demo` and a temporary database. Editing .env cannot turn that launcher into real email/Razorpay. It resets its temporary records when stopped; it is unsuitable for saved data or proving integrations.

## Saved database migration and release gate

No saved-database dry-run was possible without the intended URI. When configured, preview only first. Review database name, counts and index operations, retain a restorable backup and matching storage key, and stop old application writers before separately authorised maintenance apply. Example only, **not executed here**:

```powershell
node scripts/migrate-payment-stages.js --dry-run
# ONLY after backup, preview approval and maintenance; replace with exact reviewed DB name:
node scripts/migrate-payment-stages.js --apply --confirm-db=gharseva
node scripts/migrate-payment-stages.js --dry-run
```

Do not apply to saved data during this review. If partial/sparse/custom/conflicting definitions or duplicate/invalid records are found, stop for deliberate review. Do not drop indexes/collections to continue. Apply is idempotent after success, but concurrent writes or an index-build failure can leave only purpose backfill completed; inspect and rerun guarded maintenance rather than resetting data.

With database/network and registry access, run `npm.cmd ci --include=dev`, `npm.cmd audit`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run deploy:check` on the deployment-pinned Node version. Investigate specific advisories and rerun regressions after targeted fixes. Blocked full-suite failures are not passes.

## Faculty demonstration walkthrough (required, not completed here)

1. Use three isolated browser profiles for customer, assigned approved professional and admin. Same-profile tabs intentionally share an account. Use another signed-out profile to confirm private API rejection.
2. In ordinary development with live email and TEST payments configured, use the shared /login with owner-authorised accounts. Confirm actual inbox receipt, mobile/password delivering to that stored email, no private access before OTP and role-correct dashboards. Repeat linked Google and Apple sign-in without an extra application OTP. Check cancelled/blocked popups and account conflicts; link only from completed local authentication.
3. As customer, confirm saved city Ahmedabad, choose a real approved Ahmedabad professional and available future IST slot. Use search or the guided assistant. Review address/notes privately and explicitly confirm the booking request. Another customer must not read it.
4. Assigned provider sees the same request and accepts. Before paying, service start must fail despite a correct visit code. Customer opens Bills & payments and launches **actual Razorpay TEST Checkout**. Close/fail once, reconcile the same order and confirm unpaid status; then complete a captured test payment using only Razorpay's documented TEST instruments. Record non-secret order/payment references and status.
5. Provider starts with the customer's visit OTP. Extra work/material proposals need customer approval before inclusion in the bill. Complete service, submit an itemised bill, request correction as customer, revise as provider and approve the current version as customer.
6. Arithmetic example for a booking/bill actually approved at INR 349: INR 99 captured deposit leaves **INR 250 / 25000 paise**, with a separate balance order. Do not change prices or invent work to obtain the example. Verify actual selected-booking figures, zero-due no-checkout, capture and combined receipts with deposit counted once.
7. Check all three dashboards, totals/references, completed service versus settlement, payout NOT_INITIATED, retries/refreshes, ownership rejection and both ledger entries. Verify Razorpay Dashboard capture and real signed events at the authorised endpoint. A handcrafted local HMAC request is not gateway delivery.
8. Open another same-profile tab, logout and confirm both clear. An exact old credential must fail in an authorised local security check; an independent-device session remains. Switch accounts and verify old forms/late responses cannot submit or reappear. Check admin warning/Stay, 15-minute idle and 8-hour absolute expiry, and password/email-OTP proof for sensitive actions after 5 minutes. Polling must not extend idle time.
9. At desktop and 360px widths, check login, OTP paste/autocomplete, errors/loading, social controls, cards, booking, checkout and receipts with keyboard/accessible labels. These browser checks did not complete here.

## Final-domain checklist

- Use one final HTTPS `CLIENT_ORIGIN`, correct `PORT`, `NODE_ENV=production`, appropriate `TRUST_PROXY_HOPS` (documented one-proxy host: 1), stable secrets, `AUTH_DELIVERY_MODE=live`, `GHARSEVA_DEMO=false`. Preserve database/encryption keys. Retain HttpOnly/SameSite=Lax/Secure production cookies and request verification. Legacy unrevocable JWTs require one-time sign-in.
- Use persistent MongoDB/Atlas with host network access and required indexes. Uploads are in MongoDB (identity images encrypted), not ephemeral host disk. Verify backup/restore, private-file access, photo persistence and database readiness after restart. Do not seed existing records or call syncIndexes.
- Select a host permitting outbound SMTP. **Render Free blocks ports 25/465/587**; the included Free blueprint is only a preview and cannot satisfy normal SMTP email login. No paid compute was enabled. Confirm hosted inbox delivery, including Apple relay.
- Add final app/auth hostnames to Firebase authorised domains and exact Firebase handler callback to Google/Apple settings. Custom auth domains/redirect flows need Firebase-supported hosting/proxy handling for `/__/auth/*`; a SPA fallback is not that handler. Test Safari/Chrome storage restrictions. Recovery cannot repair missing domain/handler setup.
- Configure Razorpay TEST webhook `https://FINAL_DOMAIN/api/payments/webhook` with matching secret. Subscribe to payment.captured, payment.authorized, payment.failed, order.paid, refund.created, refund.processed, refund.failed. The URL must be reachable and accepted by Razorpay; localhost and several common tunnel/interceptor domains are blocked. No endpoint/tunnel was provisioned. Confirm actual delivery, signatures, retries and dashboard references.
- Build before start. Production uses `npm.cmd run deploy:check` then `npm.cmd start` (host shell uses npm equivalently). Readiness: `/api/health`; liveness: `/api/health/live`. After authorised deployment, run `npm.cmd run deploy:smoke -- https://FINAL_DOMAIN` and refresh /login, all login aliases, profiles and protected routes. Confirm HTTPS cookies, no private caching, ownership and restart behaviour. No public deployment smoke check was possible here.

## Official setup sources checked

- Firebase Google: https://firebase.google.com/docs/auth/web/google-signin
- Firebase Apple/relay: https://firebase.google.com/docs/auth/web/apple
- Firebase Admin verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firebase redirect storage/hosting: https://firebase.google.com/docs/auth/web/redirect-best-practices
- Apple web Services ID: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/
- Razorpay Standard Checkout/capture: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- Razorpay webhook validation/endpoint restrictions: https://razorpay.com/docs/webhooks/validate-test/
- Nodemailer SMTP: https://nodemailer.com/smtp
- Render Free restrictions: https://render.com/docs/free

Final approval requires a passing database-backed suite, account-backed email receipt, social sign-in, both Razorpay TEST charges, actual webhook delivery and isolated-browser demonstration. These remain release blockers.
