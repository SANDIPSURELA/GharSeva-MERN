# Direct Google and Apple sign-in — setup and verification

27 October 2026. Local milestone in C:\workspace\GharSeva-MERN, based on commit 8f566da. The working tree was clean at inspection. Earlier Brevo, catalog/demo, Razorpay, city, document, approval and session work remains intact.

No push, deployment, hosted/shared database operation, external account setting change, email, payment, purchase or real OAuth sign-in was performed. Local server/.env, stable secrets and the Render startup command were not changed. Reports of current hosted configuration/deployment are separate from this local verification.

## Confirmed defects and changes

- SocialSignIn's authenticate function was inside useEffect and outside the render callbacks' scope. It is now component-scoped and callable by the Google/Apple buttons. The orphan redirect-recovery button was removed: this application never initiated full-page redirect login.
- Local availability previously checked only truthy Firebase strings. Readiness now validates project/web settings, authDomain syntax, readable matching-project service-account JSON or the inline Admin pair, and RSA PEM syntax. Google and Apple flags are independent. These checks do not confirm credentials, provider activation, domains or successful OAuth.
- The Admin verifier still uses verifyIdToken(token, true), not JWT decoding. It now has a bounded 15-second wait, sanitized errors, explicit expected-provider checking for current clients, and post-verification project/issuer/audience/subject/expiry/tenant/recent-authentication checks. Unsupported sign-in methods and unverified email fail. Revocation remains checked.
- Firebase Auth emulator configuration is refused by this verifier; production startup explicitly rejects it. There is no emulator/unsigned-token login path.
- The SDK remains memory-only. Popup operations have a shared submission guard, stale-generation checks and cleanup. The application exchange checks the original session context/epoch before sending the token. Logout and cross-tab invalidation clear Firebase state and invalidate pending results.
- Linking remains an explicit authenticated action with the current GharSeva password and a recent verified provider token. Concurrent duplicate linking to the same owner is idempotent; a foreign binding is rejected. No automatic email-based linking was added.
- An existing Firebase UID can gain a second allowed provider only through that explicit linking flow. The original uid/provider/user binding remains; an optional additionalProviders array records explicit additions. A different provider cannot use a mapping merely because Firebase returned the same UID.
- Apple relay consent is enforced in both directions: incoming Apple relay identity, or linking identifying credentials to an account already associated with a relay. Stored names, email, password, role, city, approvals and documents are preserved.
- Incomplete optional social configuration now produces production warnings and disables that social capability instead of blocking independent password/email authentication. Unsafe production demo/emulator settings remain fatal. No authentication assertion was removed.

Current clients send provider=google or apple alongside the Firebase ID token, and the verified sign_in_provider must match. Older clients without that hint remain compatible, but only an enabled verified provider with an explicitly permitted UID/provider binding can sign in.

## Account and session contract

Password login remains password → OTP to the account's stored email → application session, for customer/provider/admin. Mobile identifiers still use the stored email destination. Social sign-in for an already-bound customer/provider identity is direct: no additional application email OTP is added.

Firebase is the identity-verification boundary; MongoDB accounts and the existing revocable HttpOnly cookies remain application authority. Firebase browser state alone never authenticates a GharSeva API call. The client sends a Firebase ID token, not a Google OAuth access token, Apple authorization code or arbitrary browser profile. Return paths still use shared/auth-navigation.js's approved application routes and stored-role redirects.

Unknown identities receive a short-lived HttpOnly registration proof and enter existing onboarding. They do not receive an application session until normal registration completes. Customers/providers must supply a supported city, required contact/profile fields, terms and a user-chosen local fallback password. No password is invented. The existing Ahmedabad/Ahemdabad normalization is reused. Apple names may be absent; onboarding honestly collects a missing name. Later logins never replace a stored profile from provider claims.

Provider registration still requires supporting evidence and the existing identity/admin approval workflow. Pending providers can access their restricted account; a social login does not make them approved or publicly discoverable. Existing saved cities stay unchanged; the existing missing-city prompt remains.

Administrators cannot sign in or link through Google/Apple, even if a matching email or an old mapping exists. Existing admin access and sensitive actions retain password-plus-email-OTP/recent-auth requirements. There is no privileged social provisioning route.

Email collisions require the existing account's normal authentication, then Account settings → Sign-in methods & contact proof → explicit Link action. Do not resolve collisions by merging accounts, changing passwords/emails or transferring a UID. Firebase's own account-exists-with-different-credential error is explained; no automatic Firebase linkWithCredential flow or cached OAuth access credential was added. If Firebase refuses issuing the desired identity, resolve the provider-side ownership through its supported owner-controlled process first. This app cannot infer ownership from a matching address.

Keep FIREBASE_PROJECT_ID stable once bindings exist. Switching Firebase projects against a database with existing UID mappings requires an explicit identity migration/review; this milestone does not provide one.

## Exact files changed

| Files                                                                                            | Purpose                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| client/src/components/ContactVerification.jsx                                                    | Callable sign-in handler, shared exchange, popup preparation, honest unavailable/recovery UI                       |
| client/src/external-identity.js (new)                                                            | Session-context-bound client exchange                                                                              |
| shared/external-auth.js                                                                          | SDK popup, duplicate/session cancellation, memory cleanup, safe messages and tested compatibility recovery utility |
| client/src/context.jsx                                                                           | Firebase cleanup on logout/private-session invalidation                                                            |
| client/src/pages/Applications.jsx                                                                | Safe linking exchange, click guard, usable errors and relay consent                                                |
| server/src/firebase-identity.js (new)                                                            | Bounded trusted Admin verifier and claims policy                                                                   |
| server/src/social-readiness.js (new)                                                             | Offline public/Admin configuration validation                                                                      |
| server/src/identity-services.js                                                                  | Reuse readiness, public options, verifier exports, production emulator ban                                         |
| server/src/registration.js                                                                       | Selected-provider checks, idempotent explicit linking, additional-provider and relay-consent enforcement           |
| server/src/models.js                                                                             | Optional additionalProviders on ExternalIdentity; original UID uniqueness retained                                 |
| server/src/deployment.js                                                                         | Independent optional social warnings; fail-closed emulator setting                                                 |
| scripts/check-integrations.js                                                                    | --google-ready and --apple-ready; no-message/no-write default retained                                             |
| server/.env.example, server/.env.production.example                                              | Existing variable names and private setup guidance; no real values                                                 |
| server/test/firebase-social-unit.test.js (new)                                                   | Readiness, actual SDK rejection, mocked verifier boundary, CLI and startup checks                                  |
| server/test/password-login-unit.test.js                                                          | Actual social/registration handlers, linking concurrency, roles, city, relay and preservation coverage             |
| server/test/external-auth-unit.test.js                                                           | Popup/duplicate/logout/recovery/session-exchange coverage                                                          |
| server/test/deployment.test.js                                                                   | Optional-provider warning and emulator production contract; connected suite remains blocked                        |
| docs/HOSTING-DEPLOYMENT.md, docs/LOGIN-TWO-STEP-SETUP.md, docs/REGISTRATION-INTEGRATION-SETUP.md | Current guidance and links                                                                                         |
| SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md                                                          | This handoff                                                                                                       |

No new external authentication package, parallel authority, database migration or index change is required. Existing documents and IDs are not backfilled. Additional provider permission is written only after an authenticated explicit link action. Existing unique email/mobile/UID constraints remain essential to concurrent onboarding; application startup still initializes declared indexes as before.

## Firebase project and Google setup — owner actions, not performed

1. Use one stable Firebase project for both public web configuration and the server Admin verifier. Register a Web app in Project settings. Copy its apiKey, projectId and authDomain into this project's existing FIREBASE_* variables below.
2. In Firebase Authentication → Sign-in method/providers, enable Google and select the required support email. Complete any Google OAuth consent/audience/test-user requirements shown for that project. Default Firebase scopes suffice; this app does not request Gmail/Drive access.
3. In Authentication settings → Authorized domains, add gharseva-mern.onrender.com and the actual isolated staging hostname. For local tests add localhost (and 127.0.0.1 if actually used). Enter hostnames, without scheme/path. Do not assume localhost was automatically authorized.
4. Use the Firebase-provided authDomain, normally YOUR_PROJECT_ID.firebaseapp.com. The corresponding OAuth redirect handler is https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler. Check that exact handler in the project's Google OAuth web-client configuration when the console requires it.
5. Generate/retrieve the project's Firebase Admin service-account credential privately from Project settings → Service accounts → Firebase Admin SDK. Keep the JSON outside the repository, or use the matching inline client_email/private_key pair. The account must be authorized for Firebase user lookup because revoked/disabled-user checking is enabled. A locally readable key does not prove its IAM permissions.
6. Set AUTH_GOOGLE_ENABLED=true only after owner setup; Apple can remain false. Restart the ordinary application so the verifier/public options use the intended settings.
7. First test against an isolated database with operator-controlled test accounts, not the shared production database. No private browser login session is assumed available to this agent.

The Google documentation supports the selected SDK popup flow. Popup denial is recoverable by allowing this site's popups and clicking again, or choosing an actually available password method. The application does not automatically launch redirects/popups in a loop. Firebase settings are prepared without starting sign-in; actual authorization requires a deliberate click.

## Apple setup and relay prerequisites — owner actions, not performed

Apple activation is not complete and is not claimed free. It requires Apple Developer Program membership. The owner must enable Sign in with Apple on a primary App ID, associate a Services ID with that App ID and website, and register the required domains and return URL. For the default Firebase auth host, the return URL is:

```text
https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler
```

Create the Apple Sign in private key and retain its .p8, Key ID and Team ID privately. In Firebase Authentication's Apple provider settings, enter the Services ID, Team ID, Key ID and private key. These are provider-console/server credentials; they are not new VITE variables or client assets. Enable AUTH_APPLE_ENABLED only after that setup. Google does not depend on these Apple prerequisites.

Use an authorized Apple test account meeting Apple's sign-in requirements, including 2FA. Test Share My Email and Hide My Email separately. The app binds the verified UID/provider, not a browser-supplied real address. Missing subsequent name fields do not replace saved data. A Firebase identity without a verified email is refused rather than inventing one.

For relay mail, use Apple's private-email-relay configuration to register the actual authorized sending sources/domains and satisfy its email authentication requirements. With Brevo, review the real envelope/sending domain and selected EMAIL_FROM_ADDRESS, not merely the GharSeva display name. Configure any Firebase-generated sender separately if Firebase itself sends email. A verified Brevo sender alone does not prove Apple will forward mail.

Do not promise OTP/password recovery to a relay address until an authorized owner actually receives those messages. Direct Apple sign-in itself does not require a GharSeva email OTP. Linking additional identifying contact/social information to a relay identity requires explicit consent; the account UI and server enforce it. Existing registered addresses are never silently replaced with a browser-supplied address.

## Exact Render/private configuration

Preserve NODE_ENV=production, AUTH_DELIVERY_MODE=live, GHARSEVA_DEMO=false. Preserve MONGODB_URI, JWT_SECRET, IDENTITY_STORAGE_KEY, CLIENT_ORIGIN/final HTTPS origin, Brevo settings, catalog data and the existing Razorpay mode/settings. Do not use npm run demo on production.

| Name                           | Owner-provided value / role                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| AUTH_GOOGLE_ENABLED            | true after Google setup; independent of Apple                                           |
| AUTH_APPLE_ENABLED             | false until membership/provider setup is ready, then true                               |
| FIREBASE_PROJECT_ID            | Exact stable Firebase project ID                                                        |
| FIREBASE_WEB_API_KEY           | Firebase Web app's public apiKey                                                        |
| FIREBASE_AUTH_DOMAIN           | Firebase-provided auth host or correctly configured Firebase Hosting custom auth domain |
| GOOGLE_APPLICATION_CREDENTIALS | Private readable JSON file path, e.g. /etc/secrets/firebase-admin.json on Render        |
| FIREBASE_CLIENT_EMAIL          | Alternative inline service-account client_email, paired with the private key below      |
| FIREBASE_PRIVATE_KEY           | Alternative inline RSA private_key; literal newlines or backslash-n supported           |
| FIREBASE_AUTH_EMULATOR_HOST    | Leave unset; production rejects it                                                      |

Prefer a Render **Secret File** named firebase-admin.json, containing the service-account JSON supplied privately by the owner, with GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json. Leave the inline pair unset. Alternatively leave the file-path variable unset and enter both inline values in Render's private Environment settings. Existing inline-pair precedence is retained if both methods are set; avoid ambiguous duplicate credential sources.

Only apiKey/authDomain/projectId and public capability flags reach the browser. Admin/service-account/private signing keys are never returned from /api/auth/options. Do not put service-account JSON, .p8, private_key, OAuth secrets or application session secrets in VITE_*, committed files, logs, screenshots or chat.

Keep the existing startup command:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

No deployment or account settings change was performed. The owner should coordinate any later manual deployment with the deployment already in progress.

Local configuration-only commands:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run integrations:check
npm.cmd run integrations:check -- --google-ready
npm.cmd run integrations:check -- --apple-ready
```

Each strict provider flag exits nonzero for that disabled/malformed/unavailable local configuration, independently. No OAuth, provider credential probe, email, payment or database change is performed. A successful readiness check means **configuration syntax/readability**, not external setup confirmation or actual sign-in. Optional incomplete providers disable their capability and produce startup warnings; they do not disable email/password authentication.

## CSP, COOP and popup strategy

The existing CSP already permits apis.google.com scripts, Google identity/token API connections and the configured Firebase authDomain frame. Razorpay conditions were preserved. No wildcard origins, disabled TLS validation or removed security headers were introduced. Helmet's existing COOP remains unchanged: a local browser could not load the review page, so no OAuth-specific CSP/COOP failure was demonstrated.

Browser popup completion under those headers remains an explicit real-browser test. If an authorized run shows a concrete blocked frame/connection or opener failure, capture the exact directive/domain and apply the narrow necessary change; do not globally disable CSP/COOP. A console COOP warning alone is not proof of failed authentication.

Do not set FIREBASE_AUTH_DOMAIN to the Render hostname just to make it look same-origin. That hostname would need the supported Firebase auth handlers/hosting/proxy configuration. A custom auth domain requires deliberate Firebase Hosting/provider setup and the matching /__/auth/handler return URL. None was provisioned here.

The UI does not initiate full-page redirects, store OAuth pending credentials or trust external return URLs. The old recoverExternalToken utility remains tested for compatibility, but there is no orphan “recover” button or automatic redirect recovery in the new UI.

## Validation performed

| Actual command/check                                                                                                                                                          | Result                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| node --test server/test/firebase-social-unit.test.js server/test/password-login-unit.test.js server/test/external-auth-unit.test.js server/test/session-security-unit.test.js | 75 passed, 0 failed, 0 skipped; mocked persistence/valid-verifier boundary plus actual Firebase Admin unsigned-token rejection |
| Preservation command below                                                                                                                                                    | 212 passed, 0 failed, 0 skipped                                                                                                |
| npm.cmd run build                                                                                                                                                             | Passed production Vite build                                                                                                   |
| npm.cmd run test:db                                                                                                                                                           | Exit 1; isolated MongoDB child started, connection failed with connect EACCES; no saved URI fallback                           |
| node scripts/check-integrations.js --google-ready --apple-ready                                                                                                               | Correctly exited 1 with local Firebase settings missing and provider flags disabled                                            |
| npm.cmd run integrations:check                                                                                                                                                | Diagnostic execution exit 0; missing/unverified integrations reported honestly                                                 |
| git diff --check                                                                                                                                                              | Passed; Git reports normal LF/CRLF conversion warnings separately                                                              |
| Local browser at http://127.0.0.1:5082/login                                                                                                                                  | Blocked: net::ERR_CONNECTION_TIMED_OUT; no page/flow verified                                                                  |

Actual preservation command:

```powershell
node --test server/test/assistant-conversation-unit.test.js server/test/brevo-email-unit.test.js server/test/catalog-reconciliation-unit.test.js server/test/checkout-unit.test.js server/test/city-demo.test.js server/test/email-delivery-unit.test.js server/test/external-auth-unit.test.js server/test/firebase-social-unit.test.js server/test/isolated-mongo-unit.test.js server/test/password-login-unit.test.js server/test/payment-gateway-unit.test.js server/test/payment-migration-unit.test.js server/test/payment-stages-unit.test.js server/test/session-security-unit.test.js server/test/work-images.test.js
```

Coverage includes selected-provider/project/issuer/expiry/subject/tenant errors, unverified/unsupported identities, Admin SDK rejection of unsigned tokens, verified Apple relay/missing name, server-only configuration, provider independence, popup cancellation/blocked/network errors, duplicate submission, logout during a pending popup, legacy consumed/no redirect results, stale-session exchange, actual registration city/consent/contact/role checks, concurrent first registration/linking, existing field/document preservation, admin refusal, role redirects, and existing OTP/session/payment protections.

Tests generate only disposable fixture keys/data; no real provider tokens or email were used. The real SDK rejection check does not validate a real Google/Apple token. Valid provider claims come from an explicitly mocked verifier boundary. In-process handler tests do not prove MongoDB atomicity, actual HTTP middleware behavior or real browser rendering; existing separate integration/session tests retain those boundaries.

The earliest current database blocker is **connect EACCES** to the helper's isolated loopback MongoDB. The child starts; selection/connect fails before application assertions. This agrees with the earlier independent local socket denial, not an Atlas credential problem. No Windows/security controls were changed. The full suite was deliberately not rerun after this readiness failure; the earlier reported 192/181 result is not represented as a new run.

Connected checks should run in a supported local environment with loopback access, using the existing isolated fixture:

```powershell
npm.cmd run test:db
node --test server/test/login.test.js server/test/customer-registration.test.js server/test/registration-workflow.test.js server/test/deployment.test.js
npm.cmd test
```

Do not replace the fixture URI with hosted MongoDB or weaken/skip assertions. A normal operator terminal or an isolated VM/container permitting its own MongoDB connection is the supported follow-up.

The local UI-only review server used no database connection, with payments disabled, and was stopped after the browser timeout. The workspace transport also briefly disconnected/recovered during inspection. Neither failure was worked around by changing Windows security or using private sessions.

| Evidence level                                                | Current status                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Local provider syntax/readability checks                      | Implemented/tested with fixtures; actual local provider settings absent/disabled |
| Mocked valid identities, SDK popup and persistence boundaries | Automated checks passed                                                          |
| Real Firebase Admin rejection of unsigned/malformed tokens    | Passed locally, without emulator or provider acceptance                          |
| Firebase Auth emulator                                        | Not enabled; unsupported verifier path, explicitly refused in production         |
| Connected isolated MongoDB/HTTP OAuth-onboarding checks       | Blocked by EACCES; not passed                                                    |
| Browser popup/CSP/COOP completion                             | Unverified; local page could not load                                            |
| Real Google sign-in                                           | Unverified; project/provider/Admin setup and authorized interactive test needed  |
| Real Apple sign-in                                            | Unverified; membership/key/provider/relay setup and authorized test needed       |
| Hosted deployment/inbox/Razorpay Checkout/webhooks            | Not verified or changed by this milestone                                        |

## Owner verification walkthrough

Use a separately configured isolated local/staging database and operator-controlled provider identities first. Never seed, migrate or repoint the shared hosted database for these tests.

1. **Availability:** Google ready/Apple false enables only Google. Apple-only configuration works independently. Both unavailable show disabled controls/setup state; password email OTP remains governed by Brevo's independent configuration. A bad optional key must not activate simulation.
2. **New customer:** choose Google deliberately, verify the trusted contact, complete required name/mobile/city/terms and a chosen password. Try Ahemdabad normalization and missing/unsupported city rejection. Confirm one account/binding after repeated clicks.
3. **Returning customer:** sign out and sign in with the bound provider; expect the stored customer dashboard/approved return path without a second application OTP. Confirm saved city/password/contact stay unchanged.
4. **Providers:** complete normal provider onboarding with authorized evidence and required city. Pending remains pending/restricted; an approved isolated provider keeps its existing approval/docs/profile. Neither social callback nor role=admin/provider browser fields may promote an account.
5. **Collision/link:** first try an unbound identity matching an existing account; no auto-merge/session. Authenticate that account using its existing method, open Account settings, confirm its current password, and explicitly link. Wrong password, foreign UID or uncompleted password OTP must fail. Repeated/concurrent linking must leave one binding.
6. **Same UID, second provider:** a new provider on an already-bound Firebase UID must initially fail direct sign-in. Only a deliberate authenticated link may add it to additionalProviders. Test Apple relay consent when linking in either direction.
7. **Apple:** test both shared and relay email and missing subsequent name. Stored data must stay stable. Consent must precede identifying associations. Actual mail to a relay inbox is a separate owner-authorized delivery test, not completed here.
8. **Cancellation/network/domain:** dismiss/block popup, disable the provider or omit an authorized test domain, and test a controlled network interruption. Show an honest error; no application session, redirect loop or repeated popup is allowed. Restore settings through the owner, not by disabling browser security.
9. **Logout/session:** use separate isolated browser profiles for roles. Sign out in one tab; protected app APIs reject the revoked cookie, same-profile tabs clear private state, and an in-flight popup result cannot silently recreate the session. Another independent device session keeps the existing policy.
10. **Admin:** verify password followed by the stored-email OTP and recent-auth sensitive-action requirements. Google/Apple direct login/link remains denied, including a matching admin email or forged portal.
11. Record only redacted outcomes, role, expected URL and test case result. Do not capture ID tokens, authorization codes, private keys, OTPs, personal payment data or identity documents.

## Remaining risks and pending milestones

Real OAuth/provider activation, Firebase IAM/API restrictions/authorized domains, browser popup/header completion, connected-database concurrency and Apple relay delivery still need external verification. Firebase-side collision recovery may require owner-managed provider linking; this app intentionally never auto-merges Firebase or MongoDB accounts. Keep the project ID stable for saved UID mappings.

Brevo actual inbox delivery and Render deployment confirmation are being checked separately. Hosted catalog reconciliation/approved Ahmedabad professionals, actual Razorpay TEST capture/Checkout/delivered webhooks, dependency updates and later approved deployment remain pending. No complete-website success is claimed.

## Current primary references consulted

- [Google Firebase sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Apple Firebase sign-in](https://firebase.google.com/docs/auth/web/apple)
- [Firebase Admin ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Admin setup](https://firebase.google.com/docs/admin/setup)
- [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple private email relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/)
- [Render environment variables/secret files](https://render.com/docs/configure-environment-variables)
