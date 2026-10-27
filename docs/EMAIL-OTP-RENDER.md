# Render Free email OTP milestone — 27 October 2026

Implemented in C:\workspace\GharSeva-MERN, on top of clean local commit 2b415817371ebe73939a67b11b924b49d7dddee1. This folder includes the earlier shared-login, two-stage-payment and revocable-session work. No older ZIP or patch was applied.

## Result and limits

The existing numeric OTP system now supports **Brevo HTTPS** or **SMTP**, selected server-side. Registration, recovery, account contact verification, customer/provider/admin password login and sensitive admin reauthentication share the same delivery function. A mobile/password login identifier still sends to the account's stored email, not SMS.

**Implemented locally, not deployed. Actual Brevo acceptance and owner inbox receipt are unverified.** Local configuration has no EMAIL_TRANSPORT, BREVO_API_KEY, EMAIL_FROM_ADDRESS or EMAIL_FROM_NAME. No external message was sent. Core configuration was inspected only through set/missing status; existing .env, database URI, JWT secret and identity-storage key were not changed. No saved or hosted database was accessed, reset, seeded or migrated.

The default when EMAIL_TRANSPORT is omitted remains SMTP for compatibility. An explicit invalid/empty selector fails closed. EMAIL_TRANSPORT=brevo does not require or use SMTP_* or Twilio settings. EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME configure only Brevo; SMTP_FROM remains the single sender source for SMTP. There is no automatic cross-transport or classroom fallback.

## Exact Render setup

In the existing Render web service's private Environment settings, retain:

```dotenv
NODE_ENV=production
AUTH_DELIVERY_MODE=live
GHARSEVA_DEMO=false
```

Add:

```dotenv
EMAIL_TRANSPORT=brevo
BREVO_API_KEY=<your private Brevo API key>
EMAIL_FROM_ADDRESS=<one verified sender address>
EMAIL_FROM_NAME=GharSeva
```

Angle-bracket values are placeholders to replace privately; never commit them. A Brevo SMTP key is not the API key. Do not add VITE_ versions of these settings. Brevo's sender address is the source address; each account's registered email remains the destination. No SMS, Google, Apple or Razorpay setup is required for this email milestone. Leave their existing optional settings unchanged.

Keep MONGODB_URI, JWT_SECRET, IDENTITY_STORAGE_KEY and Atlas access unchanged. Keep the correct final HTTPS CLIENT_ORIGIN. The documented Render start command (also reflected in render.yaml) remains:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

Build command:

```sh
npm ci --include=dev && npm run build
```

This derives the origin for the assigned onrender.com URL. If using a final custom domain later, set the exact canonical HTTPS origin in the start command rather than deriving a different assigned URL. Preserve TRUST_PROXY_HOPS=1 for the documented single Render proxy. Do not use npm run demo for hosting: it overrides the environment to classroom authentication and simulated payments.

The Blueprint changes are only a recipe. They do not update an already-created service's Environment settings or deploy anything. The owner must set the variables in the existing service, review/push the updated code and manually redeploy the chosen commit. No external account or deployment was created in this task.

## Brevo account and sender prerequisites

1. In the owner's Brevo account, enable transactional email access and confirm the account is allowed to send and has sufficient quota.
2. Under Settings → Senders, Domains, IPs → Senders, add the intended From name/address. Complete the sender confirmation in Brevo if prompted. EMAIL_FROM_ADDRESS must exactly match the intended verified sender mailbox.
3. Authenticate a domain you control under Domains using the Brevo-provided ownership, DKIM and DMARC DNS records. Use the exact records from the account; preserve an existing DMARC policy rather than blindly replacing it. Wait until Brevo reports the intended setup verified. If using a free mailbox sender, review Brevo's sender restrictions; its domain cannot be authenticated by you. Domain configuration belongs to the operator.
4. Under SMTP & API → API Keys, create/select the private API key and store it only in Render's private server environment. Do not put it in a browser, screenshot, chat or repository.
5. On account-side rejection or 429, inspect the private Brevo transactional status/quota and sender configuration. Do not enable demo authentication as a workaround.

Official references reviewed on 27 October 2026:

- [Brevo transactional email request and response](https://developers.brevo.com/docs/send-a-transactional-email)
- [Brevo POST /v3/smtp/email reference](https://developers.brevo.com/reference/send-transac-email)
- [Create and verify a sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
- [Authenticate a sending domain](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Render Free limitations, including outbound SMTP](https://render.com/docs/free)

## Diagnostics: three different levels of evidence

| Level                    | Evidence                                                                                 | What it does not prove                          |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Configuration validation | selected settings pass syntax/presence checks; public email capability becomes true      | key validity, sender approval, quota or receipt |
| Provider acceptance      | Brevo returns successful HTTP status with messageId; SMTP accepts the intended recipient | arrival in an inbox                             |
| Owner receipt            | owner confirms the code arrived and completes the normal OTP flow                        | delivery for every future user or mail provider |

From a trusted local terminal with that environment configured privately:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run integrations:check
npm.cmd run integrations:check -- --email-ready
```

Both commands send **no message** and make no email API calls. The default report remains informational. The strict --email-ready check exits 1 for absent/malformed selected settings or non-live/demo mode and 0 for configuration readiness only. Missing optional SMS/social/payment settings do not fail strict email readiness. The public /api/auth/options response contains public capabilities and the existing public Firebase browser configuration only; it contains no Brevo settings, sender address, secret key or OTP.

For an explicitly selected SMTP environment only:

```powershell
npm.cmd run integrations:check -- --smtp-connect
```

This authenticates a connection without sending email; it is refused when Brevo is selected. SMTP retains required TLS, normal certificate validation, bounded timeouts and intended-recipient acceptance checks. It is unsuitable for Render Free's blocked ports 25/465/587.

## Owner-authorized hosted inbox test

No automated test sends mail. Perform the following only with an inbox you own or are explicitly authorized to use, by entering that address through normal registration or using an existing account that already stores it. Do not modify fictional demo account identities or mass-test saved users.

1. After the owner's manual redeployment, open https://gharseva-mern.onrender.com/api/auth/options. For email-only setup expect email=true, demo=false and optional unconfigured capabilities=false. This checks capability only.
2. On customer registration, enter the authorized inbox and request a code. Confirm receipt in that inbox (including spam if necessary), then enter it in the page before its five-minute expiry. Do not paste the code in logs or chat. Complete registration with the required city and consent.
3. Sign out. At shared /login enter that account's email and password. Before email proof, protected screens/APIs must remain unavailable. Confirm the new email arrived and complete the OTP. Repeat using its mobile number plus password; the destination must still be the same stored email.
4. Use a separately authorized provider/admin account with an accessible stored inbox to check their shared password-plus-email-OTP flow; do not promote accounts for testing. Provider approval and admin action reauthentication remain required.
5. Check recovery for a verified customer/provider email. Complete proof and password reset only on the chosen test account; sign in again normally. Recovery does not authenticate automatically and admin self-service recovery remains excluded.
6. Check resend cooldown, wrong/expired code, old-code rejection after resend and replay after success. Avoid repeatedly locking real users. Pending registration/recovery requests created before deployment may need a fresh code because they predate the new delivery-complete flag.
7. Record only date, flow, accepted/failed status and the owner's receipt confirmation. A provider acceptance is not receipt. Do not share passwords, OTPs, keys, message bodies or private account data.

If Brevo rejects, times out or responds ambiguously, the request fails safely; it does not authenticate, show a live code, silently switch providers or retry automatically. Wait for cooldown and request a new code through the UI. New/replacement requests invalidate previous codes. Late provider acceptance cannot revive an expired contact challenge. Failed or uncertain resend leaves both the old and unaccepted new login codes unusable.

Registration/recovery all-unavailable states show one support action. Email-only state selects email, disables SMS and hides unconfigured social methods. Recovery no longer recommends unavailable Google/Apple sign-in.

## Files changed and purpose

| Files                                                                                              | Reason                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| server/src/email-delivery.js (new)                                                                 | selected transport readiness, validated sender/recipient, fixed HTTPS Brevo request, safe failures, preserved SMTP TLS/acceptance |
| server/src/identity-services.js                                                                    | route existing numeric delivery and public email capability through selected transport; keep production demo refusal              |
| server/src/models.js, server/src/registration.js                                                   | delivery-complete flag and atomic activation/consumption for contact challenges; accurate unavailable error                       |
| server/src/deployment.js                                                                           | production diagnostic warning follows selected transport                                                                          |
| scripts/check-integrations.js                                                                      | strict no-message --email-ready; selected-transport missing settings; preserve SMTP connection-only check                         |
| shared/verification-options.js (new), client/src/components/ContactVerification.jsx                | email-only/all-unavailable capability handling and support action                                                                 |
| client/src/pages/PasswordRecovery.jsx                                                              | remove unconditional recommendation of unconfigured social methods                                                                |
| server/test/brevo-email-unit.test.js (new), server/test/password-login-unit.test.js                | mocked adapter/CLI and actual-handler regression coverage with in-memory persistence                                              |
| server/.env.example, server/.env.production.example, render.yaml                                   | exact private server settings and assigned-origin startup recipe                                                                  |
| docs/HOSTING-DEPLOYMENT.md                                                                         | current Render email setup and correct shared/admin login requirements                                                            |
| docs/LOGIN-TWO-STEP-SETUP.md, docs/REGISTRATION-INTEGRATION-SETUP.md, docs/FINAL-HOSTING-REVIEW.md | mark SMTP-only advice as superseded by this milestone                                                                             |
| docs/EMAIL-OTP-RENDER.md (this file)                                                               | implementation evidence and operator walkthrough                                                                                  |

No dependency or lockfile change. Payment, city, provider-image, identity-document, assistant and session-security implementation files remain unchanged. Existing persistent business data is not changed by this milestone. The new contact-challenge field needs no data migration; five-minute pending challenges can be requested again.

## Checks actually run

Runtime: Node v24.13.1, within the project's supported range. Pinned Render Node v24.22.1 was not executed locally.

| Check                                                                                               | Actual result                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Focused auth/email/session/assistant/city/images/payment/migration/social unit run                  | **153 passed, 0 failed**                                                                                |
| Production build: npm.cmd run build                                                                 | **Passed**                                                                                              |
| Complete bounded suite: node --test --test-timeout=60000 --test-concurrency=2 server/test/*.test.js | **336 tests: 153 passed, 183 disposable MongoDB setup/cleanup failures**; no assertion failure observed |
| Real local readiness: npm.cmd run integrations:check -- --email-ready                               | **Exit 1 as expected**: local default SMTP is unconfigured; no provider call or message                 |
| Strict CLI with mocked Brevo settings and missing/malformed settings                                | Passed; no provider calls/messages                                                                      |
| Existing SMTP connection/acceptance/TLS tests                                                       | Passed with mocked Nodemailer                                                                           |
| Actual Brevo acceptance and owner inbox receipt                                                     | **Unverified:** missing provider settings and authorized test inbox                                     |
| Connected desktop/mobile browser UI                                                                 | **Not performed**; capability-state policy tests and production JSX build passed                        |
| git diff --check                                                                                    | Passed                                                                                                  |

Exact focused command run:

```powershell
node --test server/test/brevo-email-unit.test.js server/test/email-delivery-unit.test.js server/test/password-login-unit.test.js server/test/session-security-unit.test.js server/test/assistant-conversation-unit.test.js server/test/city-demo.test.js server/test/work-images.test.js server/test/payment-stages-unit.test.js server/test/payment-migration-unit.test.js server/test/external-auth-unit.test.js
npm.cmd run build
node --test --test-timeout=60000 --test-concurrency=2 server/test/*.test.js
npm.cmd run integrations:check -- --email-ready
git diff --check
```

The full run reported mongod startup errors (unexpected exit code 2 / internal fassert failure), followed by suite setup/cleanup failures. These are blocked database integration checks. Full output: .test-tmp/email-milestone-full-suite.log. Focused output: .test-tmp/email-milestone-focused.log. No saved database was substituted for the failed disposable environment.

Automated cases use mocked outbound providers and temporary in-memory model fixtures. They are not actual Brevo/SMTP, Atlas, browser or Razorpay transactions. All seed/expansion functions exercised in preservation tests use mocked disposable tables, not the saved database. No real email, Google/Apple sign-in, payment or webhook delivery was attempted.

## Still pending after this first repair

- Owner Brevo account/API key and sender/domain setup, manual redeployment and confirmed inbox OTP journey.
- Database-backed auth/registration/regression suite in a working disposable MongoDB environment.
- Catalog initialization and approved Ahmedabad providers.
- Razorpay TEST deposit, final balance and delivered signed webhook verification.
- Payment-copy consistency review.
- Actual Google/Apple setup and sign-in verification.
- Fresh dependency audit and targeted dependency updates.
- Connected desktop/mobile browser review and final hosting readiness assessment.

This completes the local email-delivery implementation, not the complete website audit or proof of hosted delivery.
