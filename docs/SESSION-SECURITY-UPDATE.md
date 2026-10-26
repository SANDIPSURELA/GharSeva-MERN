# Session security and administrator protection

Implemented directly in the existing project. Accounts, roles, passwords, approvals, documents, bookings, bills, payments and server drafts are not reset or migrated by this milestone.

## Session contract

A browser profile shares its HttpOnly cookie normally across tabs. A new tab does not need a separate login. A copied URL supplies no permission: every protected API verifies the signed credential, its persistent `AuthSession` record and the current account from MongoDB. Customer/provider sessions cannot grant administrator access. The session context returned to JavaScript is a non-authenticating nonce, not a session credential.

The record stores a SHA-256 hash of the signed credential, a random context, account/role/version snapshots, issuance/absolute expiry, revocation and administrator idle/recent-auth timestamps. The cookie remains HttpOnly, SameSite=Lax and Secure in production, with the existing root path. OTP cookies remain HttpOnly and SameSite=Strict. Origin and request-verification checks remain enabled. Private responses use `Cache-Control: no-store, private`; the frontend also requests without HTTP caching.

Logout revokes only the presented session and clears its cookie. A saved copy of that credential is then rejected. An independent device/session remains valid. Successful account switching revokes the previous browser credential. Password changes/recovery retain account-wide version revocation. Suspension changes made through the administrator endpoint increment that account's session version, so unsuspending cannot revive older credentials. Stored-role/status/version checks run on every protected request. Current provider approvals are still checked by existing permission rules; pending providers retain their existing onboarding access.

**Deployment requires a one-time login again for legacy JWT-only sessions.** Credentials without a new session identifier and matching revocable record are rejected. There is no legacy bypass and no need to rotate the existing JWT secret or modify accounts. Auth-session indexes are additive and created through existing model initialisation; there is no data reset/seed/migration command for this session update. Keep a stable server secret and persistent MongoDB. Database errors fail closed.

Classroom sessions are explicitly marked demo and cannot authenticate after explicit non-production demo mode is disabled. Live delivery failures do not create a login or recent-admin proof. Existing direct linked Google/Apple sign-in remains server verified and customer/provider-only; it creates the same revocable session record. Unknown-identity onboarding/linking rules are unchanged.

## Tab synchronisation and stale requests

BroadcastChannel plus a storage-event fallback send only an invalidation signal and random deduplication nonce. They carry no identity, role, password, code or credential. Receivers clear private React state, cancel requests and recheck `/api/auth/me`. They never accept identity or permissions from a message. Authentication credentials are never placed in localStorage or sessionStorage. Existing public comparison/selection storage is separate.

Protected mutations require `X-GharSeva-Context` matching the authenticated server session. A stale form with the previous context is refused with 409 even if the shared browser cookie now belongs to another account. The nonce alone cannot authenticate. Existing request/origin protections are still required. Non-browser clients must first authenticate and read their own context from the authenticated response header, then send that context on protected writes.

The client discards late responses from earlier session generations even when cancellation cannot stop the network response. Account changes reload the page after a server identity check, destroying stale component/form state. Logout and expiry unmount private UI and gate further requests. Already accepted server operations may still finish under their original authenticated account; logout does not erase bookings or reverse accepted payments.

Focus, visibility restoration and Back/Forward restoration revalidate identity. Page hiding marks private content hidden before restoration, and the restored page is checked before showing it. 401 clears/rechecks state; ordinary 403 rechecks identity while preserving the endpoint error. Reauthentication-required 403 opens its separate security check. Account-change rechecks do not recursively schedule themselves. Public return routes continue through existing validated login navigation; private addresses/conversations are not put in URLs.

Clearing browser state does not delete persisted applications, bookings or assistant drafts. Once invalidated, component cleanup requests cannot submit protected draft deletions. Logout failures lock private screens and offer retry/reload; the UI does not claim an unconfirmed server logout succeeded.

## Administrator timeouts

Server-only settings in `server/.env`:

```dotenv
SESSION_ABSOLUTE_HOURS=8
ADMIN_IDLE_MINUTES=15
ADMIN_REAUTH_MINUTES=5
```

Defaults are eight hours absolute lifetime for every role, 15 minutes administrator inactivity and five minutes recent-admin proof. Accepted numeric ranges are respectively 1-24 hours, 1-240 minutes and 1-15 minutes; invalid settings use the defaults. Absolute expiry is fixed at issuance and cannot be extended by activity. Idle deadlines are capped by absolute expiry. Use a fresh login when reviewing changed issuance/idle settings. Keep existing JWT/SMTP/Firebase/payment secrets; no new external service is required.

Normal authenticated reads, dashboard polling, background refreshes and cross-tab rechecks do not update the idle deadline. Only the dedicated authenticated/context-bound activity endpoint does. The frontend calls it after visible, focused, trusted pointer/key interaction (throttled), or the explicit **Stay signed in** action. It sends an empty object, never key values, typed content or form fields. No activity call can resurrect an expired server record.

A warning appears before expiry (up to 90 seconds, scaled down for short configured idle periods). **Stay signed in** refreshes the idle deadline while respecting absolute expiry. Expired administrators must perform normal password-plus-email-OTP login; the reauthentication or activity endpoints cannot extend an expired session.

## Sensitive administrator actions

All existing mutations guarded by an admin-capable role check require recent proof when the acting account is admin. This covers account status/provider approval, invitations/access grants and revocations, identity/application review, platform settings/catalog/moderation, and existing admin refund simulation/review-resolution actions. Admin changes to their own account/password also require recent proof. Reads do not. No new refund, payout or account-management functionality was added.

Normal completed admin password-plus-email-OTP sign-in counts as fresh proof for the initial window. After that window, the frontend opens **Confirm administrator access**. It reuses the password/email-code UI and delivery adapter through `/api/auth/reauth`, `/resend`, `/verify`, `/pending`, with a separate `admin_reauth` challenge purpose and Strict pending cookie. The proof binds the current stored admin, current session, role, registered email and account version/revision. A browser cannot choose another account, email or session to authorise.

The shared challenge implementation retains five-minute codes, ten-minute absolute password proof, 60-second resend cooldown, at most five failed submissions and single-use conditional consumption. Resending invalidates old codes without resetting attempts or extending password proof. Verification does not issue a new login cookie, extend absolute expiry or authenticate an expired session. Password/contact changes invalidate stale proof. Failed live email delivery cannot grant recent proof or display a code.

After successful proof, the originally requested action is retried once only if its client session generation/context remains unchanged. Cancelling, expiry or account switching cancels the retry. Concurrent additional sensitive requests are told to finish the current check and retry deliberately. Actual endpoints enforce the server timestamp; typed `reauthenticated`, role or success flags provide no authority.

## Startup and manual review

Use the existing persistent `MONGODB_URI` and server settings. Do not seed, reset data or rotate the JWT secret for this update. Restart the ordinary API/frontend processes to load the new code together:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run dev
```

Open `http://localhost:5173`. If reviewing a built client:

```powershell
npm.cmd run build
npm.cmd start
```

`npm.cmd run demo` remains an explicitly separate, temporary classroom launcher. It forces demo authentication and simulated payments, regardless of delivery/payment entries in `.env`. It does not override the three new timeout settings. Do not stop an ongoing temporary classroom session until ready to lose its temporary database; that is the launcher's existing behaviour. This security implementation does not run that launcher or reset a database.

Manual checks with configured accounts:

1. Sign in through the shared password/email-OTP login. Open its dashboard in a second tab of the same profile: the account should already be signed in.
2. Sign out in one tab: the other tab should promptly clear private content and reach login. A saved copy of the old cookie must get 401 from `/api/auth/me`; a separate device/session for that account should remain valid.
3. In one tab leave a private form open, then sign out and sign in as another account in the other tab. The old form must disappear. A stale request with the previous context must receive 409. Check customer/provider attempts at admin API URLs (403) and anonymous attempts (401).
4. Open a real Incognito/private browser window with no login. Copy customer/provider/admin dashboard URLs into it. Private API data must remain unavailable and the UI must require login. A separate tab in the same normal profile is not a signed-out browser.
5. For quick timeout review, set `ADMIN_IDLE_MINUTES=2`, `ADMIN_REAUTH_MINUTES=1`, restart API and sign in fresh as admin. Leave both dashboard tabs untouched while polling runs. A warning should appear; test **Stay signed in**, then let another session expire. Expired access/activity/reauth must fail and normal login must be required. Reset the settings to the defaults afterward. Automated tests use controlled time instead of sleeping.
6. After the recent-proof window, change an existing account's access or perform an existing admin refund-review/simulation action. Verify that password plus email OTP is required, then repeat an allowed action within the window. Cancel the check and verify no original action retries. Test a wrong/expired code and direct endpoint attempts without proof.
7. Use Back/Forward after logout, restore a hidden tab, test a delayed private request across account change, and check desktop/mobile warning and OTP layouts. Retest an ordinary booking and the existing deposit/bill/balance workflow. Do not use an actual financial transaction merely to review session controls.

Real email still needs accessible registered inboxes and configured server SMTP; classroom codes are visibly labelled and non-production only. Google/Apple and Razorpay still need their existing real/test account configuration respectively. No successful external-service test is implied by these local checks.

## Files changed by the session-security task

Runtime/session changes:

- `server/src/auth.js`: persistent session issuance/revocation, context validation, policy timestamps, server activity and recent-admin enforcement. The concurrently added optional public-auth integration is preserved.
- `server/src/models.js`: additive `AuthSession` schema/indexes and session-bound `admin_reauth` challenge fields.
- `server/src/password-login.js`: shared password/email-OTP machinery for separate login and admin reauthentication purposes; awaited session creation.
- `server/src/app.js`: logout/session routes, admin reauthentication mount, account-status version invalidation, own-admin account/password guards and structured auth error codes.
- `server/src/registration.js`: direct linked social sign-in awaits persistent session creation and revokes the previous browser credential.
- `server/src/identity-services.js`: distinct administrator-security wording for reauthentication email.
- `shared/session-client.js`: request generation/cancellation, context handling, non-sensitive tab signals/fallback and focus/history lifecycle support.
- `client/src/api.js`, `client/src/context.jsx`: central session-aware requests, verified server identity, clearing/rechecking state, cross-tab changes and safe logout failure handling. Concurrent city-selection changes remain integrated.
- `client/src/App.jsx`, `client/src/pages/Auth.jsx`: guarded private UI and session-check retry integration.
- `client/src/components/LoginCode.jsx`: reusable endpoint/button labels for the existing OTP component; normal login defaults and OTP CSS retained.
- `client/src/components/SessionControls.jsx`, `client/src/components/SessionControls.css`: idle warning/Stay action, scoped password/OTP reauthentication, keyboard focus and retry controls.

Tests/configuration/documentation:

- `server/test/session-security-unit.test.js`: actual middleware/handler and shared client-controller tests with controlled time and memory persistence.
- `server/test/session-fixture.js`: test-only revocable credential/context helpers; no application bypass.
- `server/test/password-login-unit.test.js`, `server/test/assistant-conversation-unit.test.js`, `server/test/payment-stages-unit.test.js`: valid session/context fixtures for their existing regression contracts.
- `server/test/login.test.js`: added persistent-session HTTP cases for logout/device separation, admin proof/idle and raw missing-context rejection.
- `server/test/login-fixture.js`, `server/test/account-invitations.test.js`, `server/test/api.test.js`, `server/test/customer-registration.test.js`, `server/test/deployment.test.js`, `server/test/payments.test.js`, `server/test/provider-identity.test.js`, `server/test/registration-workflow.test.js`, `server/test/service-assistant.test.js`: adapt authenticated business-test requests to the new context contract. The test expecting legacy JWT-only access now expects refusal. Dedicated security cases use raw requests and do not auto-add missing proof.
- `server/.env.example` and this document: timeout settings and rollout/review instructions.

Other city, seed, image and assistant work was observed changing concurrently and preserved. Those changes are not attributed to this session-security task. The temporary browser-review files were removed and the original Vite configuration restored. No dependency upgrades or ZIP were made.

## Repeatable checks

```powershell
node --test server/test/session-security-unit.test.js
node --test server/test/password-login-unit.test.js server/test/payment-stages-unit.test.js server/test/assistant-conversation-unit.test.js server/test/work-images.test.js server/test/city-demo.test.js
npm.cmd run build
npm.cmd test
```

Bounded diagnostic runs used here:

```powershell
node --test --test-force-exit --test-timeout=45000 server/test/login.test.js
node --test --test-force-exit --test-timeout=45000 server/test/*.test.js
```

These focused security checks include shared credential reuse, anonymous/wrong-role denial, exact logout revocation, independent devices, account/context substitution, password/status/role changes, suspension followed by re-enabling, idle/absolute limits, background polling, concurrent logout/activity, separate reauthentication purpose, wrong/expired/reused/competing codes, live delivery failure, refund endpoint bypass, stale responses/forms, signal deduplication and history/focus restoration. They exercise production code with controlled clocks and mocked persistence/network adapters; they do not certify MongoDB atomicity or browser layout.

Design references: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). The implementation uses server-controlled revocation and deadlines rather than treating a browser countdown as authority.

## Actual completion results (25 October 2026)

| Check                                        | Actual result                                                   |
| -------------------------------------------- | --------------------------------------------------------------- |
| Session-security middleware/controller tests | 26 passed                                                       |
| Existing password/login tests                | 16 passed                                                       |
| Payment stage tests                          | 26 passed                                                       |
| Assistant conversation tests                 | 19 passed                                                       |
| Work-image tests                             | 12 passed                                                       |
| Current city/demo tests from concurrent work | 16 passed                                                       |
| Final focused run                            | **115 passed, 0 failed**                                        |
| Final bounded full regression                | **297 tests: 115 passed, 182 failed at database setup/cleanup** |
| Dedicated login/Mongo HTTP suite             | **25 blocked at setup**                                         |
| Production build                             | **Passed**                                                      |

The full suite did not pass. Local MongoDB connections failed with `connect EACCES 127.0.0.1:<temporary-port>`; some older fixtures also had Windows Mongo startup/cleanup errors. There were no assertion failures in that final full-run log, but the database-backed test bodies therefore did not verify their behaviour. The focused tests use mocked persistence/adapters and controlled time. They verify the application logic, not a successfully connected persistent database or real MongoDB concurrency/index behaviour.

A temporary, scoped in-memory HTTP/browser fixture was prepared without using the existing database. Browser navigation could not reach it (loopback connection refused/timed out), and a direct local diagnostic request also returned `EACCES`. No successful two-tab shared-profile, isolated signed-out context, desktop/mobile warning, reauthentication modal or Back/Forward browser journey is claimed. Available browser APIs also did not expose isolated-context creation. The fixture was removed, its process stopped, and Vite configuration restored. The actual UI/components and production bundle build successfully; visual/browser behaviour still needs the manual review above in an unrestricted local browser.

No actual SMTP delivery, configured Google/Apple authentication, Razorpay transaction or gateway refund was performed. Existing account records, passwords, approvals, documents, bookings and payments were not reset/reseeded. No configured existing/external database was used for a migration. Other city/demo changes arriving during this task were preserved and included in the final checks.

Logs retained for review:

- `.test-tmp/session-final-results.txt`: final 115 passing focused checks.
- `.test-tmp/session-full-final-results.txt`: complete bounded full-run failures and setup reasons.
- `.test-tmp/session-http-results.txt`: blocked current login HTTP suite.
- `.test-tmp/session-build-results.txt`: actual production build output.

Deployment/review remains necessary for real MongoDB persistence, real browser tab/history behaviour, production Secure-cookie handling behind your configured proxy and external identity/email integrations. This implementation is not a claim of a security certification.
