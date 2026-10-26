# Shared login update — 25 October 2026

Implemented directly in `C:\workspace\GharSeva-MERN`. The main login is now `/login` for customers, professionals and administrators. This report supersedes the earlier separate-login-page policy; SMTP/Firebase setup remains documented in `LOGIN-TWO-STEP-SETUP.md`.

## Result

- One neutral **Welcome back** page, with **Sign in to your GharSeva account**. No customer/professional selector and no default customer portal in password, OTP or shared social-login requests.
- Email/mobile, password visibility, Forgot password, Continue, Google/Apple setup states, customer registration and professional application links remain. Existing styles and the compact OTP input are preserved.
- `/customer/login`, `/provider/login` and `/admin/login` redirect to `/login`, forwarding only a validated internal return destination. Admin is an optional URL shortcut, not a different authentication permission.
- Password authentication for every stored role is password → email OTP → session. Linked Google/Apple customer/provider identities still sign in directly using the verified external mapping. Administrators cannot use external sign-in or public onboarding to obtain admin access.
- Default destinations are `/dashboard/customer`, `/dashboard/provider` and `/dashboard/admin`, selected from the completed authentication response's stored role. Customers may return to a legitimate booking, assistant or finder destination. Providers/admins cannot be sent into customer booking actions. Cross-role dashboards, external URLs, protocol-relative paths, backslashes and encoded control/path separators are rejected.

The current running API was observed to still use the older portal-required implementation: it replied **Choose a valid sign-in page** to a new request without a portal. The source update is complete, but that process needs a restart before live browser sign-in uses it. The frontend now explains this stale-API state rather than adding a role value or weakening authentication. The existing process was not stopped because the classroom launcher can hold temporary data.

## Authentication contract and preserved protections

```http
POST /api/auth/login
Content-Type: application/json
X-GharSeva: 1

{"identifier":"registered email or +91 mobile","password":"account password"}
```

Correct credentials return HTTP 202 and the existing restricted HttpOnly pending cookie. The server sends to the registered email, including for mobile identifiers. The response exposes no privileged account record and creates no authenticated session.

```http
POST /api/auth/login/verify

{"code":"six digits"}
```

The browser automatically includes its pending cookie. Resend uses `POST /api/auth/login/resend` with `{}`; Back uses `DELETE /api/auth/login/pending`. Browser IDs/destinations/roles cannot choose the account. Legacy role/portal fields on password and external login are ignored rather than used for authorization.

The existing pending-record `portal` field is retained for compatibility, but now contains a **server-derived stored-role snapshot**. Both challenge lookup and the final read after atomic consumption recheck the real account's status, role, registered email, password/contact proof, contact revision and session version. Five-minute codes, five failed attempts, single use, cryptographic generation, keyed digests, browser binding, 60-second resend delay, old-code invalidation and the fixed ten-minute password-proof deadline remain in place. Existing password challenges whose role snapshot is valid remain compatible. No database migration is necessary.

Standalone email/phone-code login stays refused. The unrouted legacy client `Auth` form is now a compatibility redirect to the current login/verified registration pages; it cannot mistakenly treat a restricted password response as a signed-in account.

Public recovery now works from the neutral Forgot password link without preselecting customer or professional. Eligibility is unchanged: an active customer/provider must prove a previously verified contact. Administrators, unverified contacts, suspended accounts and unknown contacts remain ineligible. Existing explicit customer/provider recovery links remain compatible; recovery proof does not issue a login session.

Google/Apple login resolves the verified UID/provider mapping to an active local customer/provider. The browser cannot grant a different role by supplying portal/role/email fields. Existing proof-required linking, Apple relay consent, collision refusal, missing-detail onboarding and provider approval status are preserved. Missing provider credentials still display **Setup needed**, without simulated external authentication.

No existing account role, hash, contact detail, approval, application, document, booking, review or payment was changed. No existing database was reset or seeded. Existing eight-hour sessions retain their current lifetime; keep `JWT_SECRET` stable. Provider sign-in does not approve a listing. The service assistant and professional-image sources/assets were not edited.

## Checks actually performed

**Passed:**

```powershell
node --test server/test/password-login-unit.test.js server/test/assistant-conversation-unit.test.js server/test/work-images.test.js
npm run build
```

The focused set passed **47 tests: 16 authentication, 19 assistant and 12 work-image checks**. The production build passed with 1,624 modules transformed. Authentication tests exercise the actual password/OTP/external/recovery handlers and JWT/role middleware using mocked persistence and delivery. They cover:

- All stored roles without a portal, by email and +91 mobile; no protected authentication before OTP.
- Incorrect credentials, suspension, expiry/reuse, competing consumption, cooldowns, attempts, resend invalidation and fixed deadlines.
- Password/contact/status/role/version changes during pending login; browser/account substitution and cancellation.
- Forged portal/role values producing only the stored account's permissions, including refusal at actual admin role middleware.
- Internal role-appropriate dashboard/booking/assistant returns and safe alias state.
- Direct linked Google/Apple customer/provider sign-in, admin mapping refusal, token validation policy, safe linking and relay consent.
- Shared recovery accepting eligible verified customers/providers while excluding admin, suspended and unverified accounts. Recovery remains separate from authentication.

**Not passed / not complete:**

```powershell
# TEMP and TMP pointed to the project's .test-tmp during these attempts.
node --test --test-timeout=20000 server/test/*.test.js
node --test --test-timeout=15000 server/test/login.test.js
```

The broad suite encountered MongoMemoryServer startup failure (unexpected process exit code 2) and setup timeouts, then stopped making progress; it was interrupted. The targeted MongoDB/HTTP login suite also failed its shared setup on the 15-second timeout, producing dependent hook/test failures. Neither is a successful integration/full-suite run. The in-process regression results above are reported separately; they do not establish real database concurrency behavior.

Run `npm test` in an unrestricted local terminal to repeat the production build and complete server suite. The targeted HTTP suite is `node --test server/test/login.test.js`.

**Browser checks:**

- Checked the actual current page and all three old URLs: each redirected to `/login`, with no Account type selection. Verified Google/Apple **Setup needed**, Forgot password, registration and professional links.
- Confirmed that the current old API rejects the new no-portal request; no authenticated session was granted. That is the restart limitation described above.
- Used temporary, isolated browser responses with the actual React Login, LoginCode, LoginAlias, Protect and shared navigation policy. Checked password → OTP, incorrect-code feedback, countdown and all three dashboard destinations. The fixture rejected any client role/portal in password or OTP payloads.
- Checked saved booking return through aliases: customer returned to the booking with date/time; provider and admin returned to their own dashboards. An external return URL fell back to the customer's dashboard.
- Desktop viewport: 1280px, document scroll width 1265px, OTP input 248 × 46px. Mobile viewport: 360px, document scroll width 345px, OTP input 220 × 46px and password input 275px wide. No horizontal overflow or overlapping OTP boxes at these checked widths. `autocomplete=one-time-code` remained present.
- Fixtures created no database records, messages or real authenticated sessions and were removed. Browser viewport was restored. The review screenshot uses fictional test inputs.

Still unverified: a live shared-login/OTP round trip against the restarted API and actual MongoDB, the full server suite, real SMTP email delivery, live Google/Apple sign-in and deployment. Automated external-token tests use mocks; no configured external account success is claimed.

## Exact local review steps

For records that must persist, use the existing persistent MongoDB configuration in `server/.env`, preserving the current URI, JWT secret and identity-storage key. No seed or database-update command is needed.

1. Restart the existing API from its owning terminal so it loads the new source. Do not run another copy on occupied ports.
2. **If the existing process is `npm run demo`, stopping it discards that temporary database. Keep it running until any temporary records you need have been preserved.** This update did not stop it or migrate/reset its data. The classroom launcher is for a fresh disposable demonstration, not persistent records.
3. For the established persistent development workflow:

```powershell
Set-Location 'C:\workspace\GharSeva-MERN'
npm run dev
```

4. Open http://localhost:5173/login. Use an existing customer, provider or admin account. Check the registered-email OTP and correct dashboard. Repeat by +91 mobile. An admin can use `/login` directly.
5. Open `/customer/login`, `/provider/login` and `/admin/login`; all should reach the same `/login`. Try a customer booking while signed out and confirm its return after OTP. A provider/admin should reach its own dashboard instead.
6. Check Back/change account, wrong code, resend after 60 seconds, expiry, narrow-screen layout and password visibility. Pending providers should still see onboarding/application status without gaining public approval.
7. Follow Forgot password with an eligible previously verified customer/provider contact. Admin recovery remains support-managed.

For a deliberately fresh classroom demo only, the existing command remains `npm run demo`. It uses temporary MongoDB, `GHARSEVA_DEMO=true`, `AUTH_DELIVERY_MODE=test`, labelled on-screen codes and **no real email**. Changing `.env` alone does not turn that launcher into live delivery. The documented demo accounts remain customer@gharseva.com / Customer123, provider@gharseva.com / Provider123 and admin@gharseva.com / Admin12345; this change did not replace or reseed accounts.

For real local email, keep `AUTH_DELIVERY_MODE=live`, `GHARSEVA_DEMO=false`, persistent MongoDB, working server-side SMTP settings and a registered inbox you control. For Google/Apple, keep the existing Firebase/provider setup. No new API keys or dependencies are required for shared login. See `LOGIN-TWO-STEP-SETUP.md` for SMTP, Firebase and Apple settings and hosting limitations.

## Files changed

| File | Focused change |
| --- | --- |
| `client/src/App.jsx` | Main shared route and three legacy redirects |
| `client/src/pages/Login.jsx` | Neutral page, no role picker/portal, shared social entry and alias redirect |
| `client/src/components/LoginCode.jsx` | Verify/resend without browser portal; styling and OTP behavior preserved |
| `client/src/components/ContactVerification.jsx` | Shared social-login caller no longer sends a portal |
| `client/src/pages/Auth.jsx` | Protected redirects use `/login`; obsolete form becomes a compatibility redirect |
| `client/src/pages/PasswordRecovery.jsx` | Neutral recovery entry and shared login return |
| `shared/auth-navigation.js` | Internal return-path validation and stored-role destinations |
| `server/src/password-login.js` | Server-derived role binding throughout pending authentication |
| `server/src/login-policy.js` | Explicit stored-role checks, with public social-role restrictions |
| `server/src/registration.js` | Social role resolution from mapping and optional neutral public recovery |
| `server/test/password-login-unit.test.js` | Adapted and expanded focused authentication checks |
| `server/test/login.test.js` | Adapted MongoDB/HTTP login expectations to shared login |
| `server/test/login-fixture.js` | Test fixture no longer supplies a default portal |
| `server/test/api.test.js` | Forged portal preserves customer permissions; admin uses shared login |
| `docs/LOGIN-TWO-STEP-SETUP.md` | Current shared contract and safe restart guidance |
| `docs/SHARED-LOGIN-UPDATE.md` | This report and exact review steps |
