# GharSeva final project handoff — 30 October 2026

Local review only. Starting HEAD: 32e6c8ff65f60ac89a5691d37668a8fed2d86e48, branch main. Ten pre-existing untracked operator files were preserved. No Atlas records, external settings, accounts, bookings or payments were changed. Nothing was staged, committed, pushed or deployed.

## Implemented behavior

The original approval error came from a separate identity guard: production registration set identityRequired, and a supporting upload/application SUBMITTED did not satisfy the REVIEWED identity record, matching name and unexpired image checks. The specific applicant's Atlas evidence was not inspected. At the owner's subsequent explicit request the policy is now normal admin profile approval, with no mandatory identity or supporting-document workflow.

- Provider registration keeps name, verified email, password, mobile, supported city, service category, service area, description, experience, price and terms. No upload or separate identity submission is required. New profiles are PENDING and identityRequired defaults false. Old documents, flags and verification history are retained unchanged.
- Ordinary admin approval/rejection reuses the password + email OTP proof in the current authenticated session. No repeated five-minute reauthentication for these decisions. Normal session revocation, context/CSRF, role checks, idle timeout (default 15 minutes), absolute lifetime (default eight hours) and login-revision checks remain. Use the existing Stay signed in prompt when needed. Account suspension/reactivation, refunds, showcase activation and other sensitive mutations retain the short recent-proof window; one proof is reusable during that window.
- Both approval entry points check an active real provider with a complete basic profile, matching supported account/service city and enabled primary category. Conditional account updates pin prior state/role/timestamp; application decisions retain their revision lock and audit history. Approval records profile.approvedBy/profile.approvedAt. No bulk approval or automatic account creation occurs.
- Application approve/reject notes are optional, with an explicit default audit note; supplied notes still validate. Correction/follow-up notes remain required. The UI reports basic-profile blockers, enables approval without documents and displays a success notification. Mandatory Identity Reviews navigation and registration redirects are removed. Historical private evidence APIs/screens remain protected for existing records; they are outside ordinary onboarding/booking.
- Google is the only social sign-in offered. Firebase popup uses deliberate account selection and memory-only Firebase state; Admin SDK verifyIdToken(token, true) validates identity, project, expiry, verified email and provider. Existing same-email password accounts are not silently merged: use explicit authenticated linking with current password. Stored roles/cities/approvals are retained; admin social login/linking remains refused. New users complete normal required customer fields and choose their password. Logout still revokes the app session and clears temporary Firebase identity.
- Apple buttons/registration prompts are removed. Old AUTH_APPLE_ENABLED settings cannot enable Apple. The exchange rejects explicit Apple requests; trusted Apple claims are refused even when a browser omits the provider. Pending old Apple registration proof cannot create a new account. Existing accounts and linked-identity records remain; password/email OTP remains available under normal eligibility rules. Existing private-relay users still need consent when linking identifying Google details.
- All twenty imported faculty profiles remain fictional and PENDING. Stable importer markers still block ordinary approval, bookings, provider booking mutations and payment orders. Showcase settings and its explicit display-only opt-in remain intact.
- Existing ownership, slot uniqueness, provider acceptance, capped deposit, visit-start OTP, completion, customer-approved final bill, separate balance, captured-payment checks and signed webhook idempotency are preserved. No new payment implementation or fake success was added.

## Exact files and reasons

- server/src/app.js, registration.js, auth.js, provider-identity.js and models.js: optional document policy, guarded basic-profile approval, audit metadata, ordinary session reuse and historical-record protection.
- client/src/pages/ProviderRegister.jsx, CustomerRegister.jsx, Applications.jsx, Dashboard.jsx, AccountInvitations.jsx, Home.jsx, Public.jsx and client/src/components/ContactVerification.jsx: simpler onboarding/approval, Google-only UI, accurate profile-review wording and preserved branding.
- server/src/firebase-identity.js, social-readiness.js, shared/external-auth.js, shared/verification-options.js: reject retired Apple paths while keeping verified Google identities and session cleanup.
- server/.env.example, server/.env.production.example, render.yaml: remove obsolete identity-required and Apple settings from examples/Blueprint. Actual private files and Render settings are untouched. Keep the identity-storage key for historical records. Old REQUIRE_PROVIDER_IDENTITY values no longer gate ordinary registration/approval.
- server/test/provider-approval-unit.test.js (new), city-demo.test.js, password-login-unit.test.js, firebase-social-unit.test.js, external-auth-unit.test.js: current-policy regression coverage over actual handlers/rules and mocked repository/provider boundaries.
- server/test/api.test.js, provider-identity.test.js, registration-workflow.test.js: connected tests updated for the explicitly requested optional-document policy; syntax checked, execution BLOCKED by isolated MongoDB connectivity.
- GOOGLE-SIGNIN-LIVE-CHECKLIST.md and SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md: current-policy banner; earlier evidence retained as historical.
- FINAL-PROJECT-HANDOFF.md: this handoff, exact release allowlist and owner walkthrough.

## Validation evidence

Final combined focused command:

~~~powershell
node --test server/test/provider-approval-unit.test.js server/test/city-demo.test.js server/test/password-login-unit.test.js server/test/firebase-social-unit.test.js server/test/external-auth-unit.test.js server/test/email-delivery-unit.test.js server/test/brevo-email-unit.test.js server/test/session-security-unit.test.js server/test/faculty-showcase-unit.test.js server/test/payment-stages-unit.test.js server/test/payment-gateway-unit.test.js server/test/checkout-unit.test.js server/test/payment-migration-unit.test.js server/test/owner-demo-providers-unit.test.js server/test/demo-plus-alias-unit.test.js server/test/assistant-client-unit.test.js server/test/assistant-conversation-unit.test.js
npm.cmd run build
git diff --check
~~~

Final combined run: **227 tests passed, zero failed, zero skipped**, exit 0, about 6.9 seconds. Earlier focused groups passed 88 and 139 tests separately. These exercise actual route/middleware/domain code with in-memory model persistence and mocked email/gateway boundaries. The full booking journey explicitly uses simulated local classroom payments, NOT Razorpay evidence. Separate gateway tests use real signature-validation logic with fixture signatures and mocked HTTP/repositories.

The first new test initially exercised an old local fixture without identityWorkflow; the fixture was corrected. After the owner changed the policy, tests were updated to assert no documents are required, rather than hiding or skipping the prior assertions.

npm.cmd run test:db exited 1: isolated process started, then 'Isolated MongoDB connection failed (connect EACCES: loopback denied by environment). No saved database was used.' No Atlas fallback. The known-blocked full suite and connected suites were not rerun. Three modified connected test files passed node --check. Run them in the owner's normal supported terminal only after test:db succeeds:

~~~powershell
npm.cmd run test:db
node --test server/test/provider-identity.test.js server/test/registration-workflow.test.js server/test/api.test.js server/test/payments.test.js
~~~

No authenticated browser/device journey was executed. Hosted public auth/payment option reads were attempted once but unavailable through the read-only web tool. Current Render configuration and deployed behavior therefore remain unverified here.

Offline readiness command actually run:

~~~powershell
npm.cmd run integrations:check -- --google-ready --payments-ready
~~~

Exited 1. Local Google is disabled and missing/malformed FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN and Admin credentials. Local payments are disabled and TEST key ID/secret/webhook secret are missing/malformed. This command performs no OAuth, sends no messages and creates no orders. Local email settings also reported incomplete SMTP; this is NOT evidence against the owner's working hosted Brevo setup. Do not copy local server/.env over Render or alter working Brevo settings.

| Evidence type | Status |
| --- | --- |
| Unit/in-memory/mocked email and gateway tests | Passed; final count below |
| Connected isolated MongoDB | BLOCKED: connect EACCES |
| Actual browser / narrow viewport | Not verified |
| Hosted Brevo password + OTP | Owner-reported working; preserved, not retested |
| Real hosted Google sign-in | Not verified; local setup missing |
| Razorpay TEST Checkout/capture | Not verified |
| Delivered TEST webhook processing | Not verified |
| Live money / payouts | Not enabled or tested |

## Register and approve one genuine provider

1. After the reviewed deployment, use a separate provider browser profile. Open Become a professional, verify an owned private email using Brevo, and enter the person's real name/mobile, own password, Ahmedabad, an enabled category, service area, service description, experience and starting visit price. Accept terms. No document/image step is required. Registration ends at My application with PENDING status.
2. Admin signs in once using their existing private email, password and fresh Brevo OTP. Open Registration requests, filter Pending, review the correct service profile, and click Approve. Alternatively use Providers & approval. A missing basic field is shown explicitly; the provider corrects their profile, not uploads identity evidence. Optional reason can be entered on reject. No one approves themselves.
3. Check Approved status and audit history. Listing approval is not a verified-identity claim. Provider must also be ACTIVE, available, offer an enabled category and have Ahmedabad as their service city to be discovered. Availability/schedule remain under the provider's normal controls; approval does not overwrite intentional settings.
4. Customer chooses Ahmedabad with Show Faculty Demo Providers OFF, filters the category and confirms the genuine provider appears. Demo cards remain explicitly fictional and nonbookable.

## Google setup — private owner steps

Use the same Firebase project for all values. In Firebase Console select/create the project and register a Web app. Authentication > Sign-in method > Google: enable it and set the project support email. Configure the consent screen/test users if Google's current project setup requires them. Authentication > Settings > Authorized domains: add gharseva-mern.onrender.com and localhost (and 127.0.0.1 only if actually used). Actual development frontend is http://localhost:5173.

Keep the Firebase-supplied authDomain, normally PROJECT_ID.firebaseapp.com. The OAuth redirect handler is https://AUTH_DOMAIN/__/auth/handler; use the exact domain from Firebase. Do not substitute the Render hostname as authDomain without hosting the required Firebase handlers. Popup strategy is used; no automatic redirect loop or unhosted custom callback is introduced.

Privately configure these existing Render server variables:

| Variable | Value/type |
| --- | --- |
| AUTH_GOOGLE_ENABLED | true |
| FIREBASE_PROJECT_ID | Firebase project ID |
| FIREBASE_WEB_API_KEY | Web app API key; browser-safe public configuration |
| FIREBASE_AUTH_DOMAIN | Firebase auth hostname, no scheme/path |
| FIREBASE_CLIENT_EMAIL | Admin service-account email; server-only |
| FIREBASE_PRIVATE_KEY | Admin RSA PEM private key; server-only; literal escaped newlines supported |

Instead of the inline Admin pair, upload the service-account JSON using Render Secret Files and set GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/your-private-file.json. Use one coherent credential source from the same project; never commit/upload private keys to Git or put them in VITE variables. This project fetches public web config from /api/auth/options, so no Firebase VITE variable is required. Code changes require the normal frontend build; runtime Firebase configuration changes require a server restart/redeploy. Do not change JWT_SECRET, MONGODB_URI, IDENTITY_STORAGE_KEY or Brevo secrets.

Run integrations:check -- --google-ready on a privately configured environment; configuration success is not a real sign-in. After deployment, /api/auth/options should report google true and apple false. Use an owned Google account: Continue with Google > deliberate account selection > complete required customer fields if new > customer dashboard > logout > protected page denied > sign in again, same saved city/account. Existing unlinked same-email account: password + OTP first, Account settings > Sign-in methods & contact proof > current password > Link Google. Never create a duplicate account or silently merge by email. Administrators retain password + Brevo OTP.

Primary references consulted: https://firebase.google.com/docs/auth/web/google-signin and https://firebase.google.com/docs/auth/admin/verify-id-tokens .

## Razorpay TEST setup — retain the current plan

No payment source changed in this task. Keep NODE_ENV=production, AUTH_DELIVERY_MODE=live and GHARSEVA_DEMO=false. Owner privately selects TEST in Razorpay Dashboard and generates/uses a TEST key pair. Configure only:

| Variable | Value/type |
| --- | --- |
| PAYMENTS_MODE | razorpay_test |
| RAZORPAY_KEY_ID | TEST public Checkout key ID starting rzp_test_; supplied by server |
| RAZORPAY_KEY_SECRET | TEST server secret; never VITE/client/logs |
| RAZORPAY_WEBHOOK_SECRET | Separate private matching TEST webhook secret |
| PAYMENT_DEPOSIT_RUPEES | Preserve existing configured amount; default 99, capped at estimate |

TEST webhook URL: https://gharseva-mern.onrender.com/api/payments/webhook . Supported events: payment.authorized (pending only), payment.captured, payment.failed, order.paid; refund.created/refund.processed/refund.failed are also supported for reconciliation and do not issue refunds. Use automatic TEST capture: the app does not call the capture API, and authorized alone never unlocks service. Signature checks use raw bytes and the separate webhook secret. Follow the existing RAZORPAY-TEST-HOSTED-CHECKLIST.md for actual Dashboard delivery evidence, unresolved reconciliation and any genuinely necessary legacy-index dry run. No migration was run or newly required by this change.

Readiness: npm.cmd run integrations:check -- --payments-ready . It checks local configuration syntax only, not gateway credentials, capture, delivery or settlement. Official references: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/ and https://razorpay.com/docs/webhooks/validate-test/ .

## Faculty/customer-to-provider demonstration

Use separate authorized customer/provider/admin browser profiles. Owner-created test bookings write normal account data; only the owner should perform the following hosted exercise after review:

1. Genuine provider registered and admin approved as above; confirm availability and an enabled Ahmedabad category. Do not use any of the twenty showcase accounts.
2. Customer password + Brevo OTP login, saved Ahmedabad city, category, provider, valid future available date/slot and service address. Submit once and record the real booking reference. A repeated active-slot request cannot create a second appointment.
3. Assigned provider password + OTP login > New requests > accept. Another provider/customer/admin cannot accept on their behalf. Refresh both dashboards to compare ACCEPTED.
4. Before the required deposit is captured, visit start must fail. Customer opens Bills & payments. If mode is unavailable, stop the payment/service portion and privately configure TEST; never mark paid manually.
5. In TEST Checkout first cancel/close and refresh: unpaid state remains and safe retry is available. Retry using official Razorpay TEST details. Verify the captured INR deposit and its booking/order/receipt in both app and Razorpay TEST Dashboard. Client success or authorization alone is insufficient.
6. Provider marks On the way. Customer shares the current visit-start code privately only on arrival. Wrong code must fail; captured deposit plus correct code permits In progress. Complete the work.
7. Provider submits an itemized final bill. Customer reviews applicable extras and approves that bill revision. Before approval, balance collection must be blocked. Approved total less valid deposit credit determines the remaining amount in paise.
8. Pay the separate balance in TEST Checkout. Compare two different order/payment references and receipts. Zero balance creates no order; overpayment/refund issues remain explicit. Refresh customer/provider/admin views: work completion and financial settlement are separate; a completed unpaid job is not falsely labelled settled.
9. Confirm a real TEST webhook reached the exact handler and was processed: Dashboard delivery event ID/time/URL/response, application PaymentEvent processing and matching persisted payment ledger. A mock, enabled setting or HTTP 202 reconciliation-required response is not proof of settlement. No live money or payouts.
10. Toggle Faculty Demo Showcase and confirm fictional labels remain; normal booking/payment controls stay unavailable for those twenty profiles.

## Safe Git/deployment handoff — instructions only

Deploy client, server, shared policy and model changes together. No dependency upgrade or new schema/index migration is needed. Keep all pre-existing untracked admin-email/importer tools and their handoffs separate. Never stage server/.env, private credential TXT, plans, journals, .test-tmp, node_modules or generated client/dist. Do not use the older SHOWCASE-DEPLOYMENT-REVIEW.md allowlist for this newer change.

These are the exact changed files for this task. Review locally before running the staging command; it has NOT been executed:

~~~powershell
cd C:\workspace\GharSeva-MERN
git status --short
git diff --check
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'The index already has staged changes; review it first.' }
$releaseFiles = @(
  'GOOGLE-SIGNIN-LIVE-CHECKLIST.md',
  'SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md',
  'client/src/components/ContactVerification.jsx',
  'client/src/pages/AccountInvitations.jsx',
  'client/src/pages/Applications.jsx',
  'client/src/pages/CustomerRegister.jsx',
  'client/src/pages/Dashboard.jsx',
  'client/src/pages/Home.jsx',
  'client/src/pages/ProviderRegister.jsx',
  'client/src/pages/Public.jsx',
  'render.yaml',
  'server/.env.example',
  'server/.env.production.example',
  'server/src/app.js',
  'server/src/auth.js',
  'server/src/firebase-identity.js',
  'server/src/models.js',
  'server/src/provider-identity.js',
  'server/src/registration.js',
  'server/src/social-readiness.js',
  'server/test/api.test.js',
  'server/test/city-demo.test.js',
  'server/test/external-auth-unit.test.js',
  'server/test/firebase-social-unit.test.js',
  'server/test/password-login-unit.test.js',
  'server/test/provider-identity.test.js',
  'server/test/registration-workflow.test.js',
  'shared/external-auth.js',
  'shared/verification-options.js',
  'server/test/provider-approval-unit.test.js',
  'FINAL-PROJECT-HANDOFF.md'
)
git diff -- $releaseFiles
# After reviewing all listed files, including the new unit test and this handoff:
git add -- $releaseFiles
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
# Only after the owner approves the staged diff:
git commit -m "Simplify provider approval and use Google-only sign-in"
git push origin main
~~~

Use the existing Render service's normal reviewed deployment of that commit. Build remains npm ci --include=dev && npm run build. Start remains exactly:

~~~sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
~~~

Confirm Render reports Live for the intended SHA; reload with rebuilt assets. No startup account approval/import occurs and showcase remains under its existing saved admin-controlled setting. The new optional-policy rules apply to old pending applicants without deleting their evidence or changing their flags. Privately check public capability flags, then execute the genuine-provider approval and booking walkthrough. Preserve Atlas access and stable secrets.

## Next owner action and blockers

Next action: review the allowlisted diff above and prepare the coherent commit for the owner's normal Render deployment; nothing here has been staged or deployed.

Remaining, in order: deploy reviewed code; owner manually approves one complete genuine provider; configure/verify Google if desired; configure and perform real Razorpay TEST Checkout plus delivered webhooks; run connected MongoDB/browser checks from a supported isolated owner environment. Existing operator tools and unrelated historical evidence remain untouched. Local configuration/mocks/build success do not establish hosted success.

## Final checkpoint

- Final combined 17-file focused command: 227/227 passed, zero failed/cancelled/skipped.
- Final npm.cmd run build: exit 0, Vite 8.3.2, 1,638 modules; main bundle approximately 599 kB. No final chunk-size warning.
- git diff --check: exit 0.
- node --check for all three modified connected test files: exit 0; connected execution remains blocked, not passed.
- Offline Google/payment readiness: exit 1 with the local configuration issues listed above; no external operation.
- No files staged; all ten initial untracked operator files remain outside the release allowlist.
