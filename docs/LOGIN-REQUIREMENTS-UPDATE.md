> Current login contract (25 October 2026): see [LOGIN-TWO-STEP-SETUP.md](LOGIN-TWO-STEP-SETUP.md). Standalone login-code methods described below are superseded by password followed by mandatory registered-email OTP.

# Login requirements — completed local implementation

Updated 24 October 2026, continuing the same uploaded GharSeva MERN project and registration milestone.

## Comparison with the original request

| Original requirement | Implementation and current limits |
| --- | --- |
| Check customer, provider and admin login | All 14 sample accounts pass email/password and +91 phone/password API login through their stored role. Dedicated pages are `/login` or `/customer/login`, `/provider/login`, and `/admin/login` |
| Google login | Visible Google control for customers/professionals, Firebase popup/token adapter and server role validation. Requires your Firebase configuration and identity linking; live sign-in is untested |
| Apple ID login | Visible Apple control for customers/professionals, Firebase Apple adapter, verified UID linking and role validation. Requires your Apple/Firebase configuration; live sign-in is untested |
| Phone number login | Existing mobile/password login plus a visible Phone OTP method. SMS uses Twilio Verify when configured; classroom mode displays clearly labelled test codes |
| OTP by text or email | Phone and email methods are directly selectable. A contact must be verified before code login. Codes expire in five minutes and have attempt/request limits |
| Better login features | Password-manager fields, password visibility, Caps Lock hint, inline validation/focus, pending locks, correct role redirects, visible methods and Forgot password |
| Password recovery | Public customer/professional recovery uses an already verified contact and a restricted ten-minute recovery session, confirmation, hashed storage and revocation of previous sessions/codes |

The registration update already contained external/OTP adapters, but placed them behind one combined toggle. This update makes the options visible, introduces the missing professional entry, enforces the selected public role on all login paths and replaces the support-only password-help path with actual recovery.

Administrator entry remains password-only. Public OTP/external/recovery endpoints exclude administrator accounts; the project owner handles an admin reset outside the public account-recovery flow. No MFA deployment or live external-service verification is claimed.

## Behaviour and compatibility

The UI sends an explicit `portal` for customer, provider or admin password login. A valid password for the wrong role receives HTTP 403 without a new session. Google/Apple and OTP use the same server role policy; OTP challenges retain the portal/purpose where they were issued. Selecting a role does not change an account role or bypass provider approval/suspension.

Old password API calls without `portal` retain role-based authentication. Existing provider links and protected-dashboard redirects now use the professional route. Customer booking destinations remain preserved through sign-in/registration. Pending providers can sign in to finish their application but are not publicly listed.

Recovery proof is separate from both ordinary sign-in and registration proof. It is stored as a hash, delivered in an HttpOnly cookie and checked against the active account, verified contact and current session version. A reset changes the password atomically with a session-version increment. Competing resets cannot both overwrite the same password. No automatic sign-in follows a reset.

Only newly seeded temporary classroom records receive demo contact proof; persistent accounts are unchanged. Old unverified accounts must sign in using their password and verify a saved contact in Account settings, or use support if they cannot sign in. Demo proof is rejected outside demo mode, and demonstration switches remain forbidden in production.

A recovery request uses the same public response shape for unknown/ineligible contacts and cannot reset an admin, suspended or unverified account. External delivery latency is not guaranteed to be uniform. A separate password-change notification is not implemented. These are explicit limits, not claims of a completed security audit.

## Checks actually run

`npm test`: **76 passed, 0 failed**. The new file `server/test/login.test.js` adds eleven meaningful integration tests to the previous 65. It checks all 14 demo users, all three roles, wrong-role passwords, email/mobile OTP, pending providers, portal/purpose isolation, recovery-only cookies, confirmation, legacy missing session versions, invalid contacts/proof, expired/suspended/changed accounts, concurrent resets and session/code revocation. Registration, application/privacy, document approval, booking and review tests still pass.

`npm run build`: passed with the existing dependency lockfile. No new dependency was needed for this login update.

Browser visual checks use the actual React components with isolated API fixtures because the supervised preview cannot run MongoDB. Customer, professional and administrator password pages plus the recovery request/reset views were checked at 320, 390, 768, 1024 and 1440 pixels without horizontal document overflow. Email/phone OTP views were also checked at 320, 390, 768 and 1440 pixels. Empty-form validation and focus, empty password visibility, method switching, role/recovery navigation and provider/admin dashboard redirects were checked. Real account/session/recovery operations were tested separately against Express and temporary MongoDB.

No credentials or codes were entered by browser automation. A complete browser login/reset journey, live Google/Apple flows, real SMTP/SMS delivery, password-manager suggestions, Windows and other browsers remain unverified. The visual harness is excluded from the ZIP.

## Run and configure

After extracting the full ZIP, run from `GharSeva-MERN` in PowerShell:

```powershell
npm.cmd ci
npm.cmd run demo
```

Open `http://localhost:5173/login`, `/provider/login`, or `/admin/login`. Sample credentials remain in `DEMO-ACCOUNTS.md`. Classroom codes send no messages. The temporary database resets when the demo stops.

For persistent/live use, follow [REGISTRATION-INTEGRATION-SETUP.md](REGISTRATION-INTEGRATION-SETUP.md), including Firebase/Apple, SMTP, Twilio Verify and production environment setup. These service accounts have not been created or connected on your behalf.
