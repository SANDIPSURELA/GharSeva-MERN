# Google sign-in live checklist

27 October 2026. The only file changed in this task is this checklist. No further application change was needed based on local inspection. Prior Google/Apple changes remain uncommitted alongside other local work. Inspected HEAD: 26987f4. No push, deployment, account setup, hosted user or database change was made.

## Evidence

- Implemented locally: Firebase popup; Admin SDK ID-token verification with revocation checks; verified UID/provider binding; customer onboarding; explicit account linking; role and logout protections.
- Locally tested: 85 focused tests passed using mocked verification/provider and repository boundaries, with Admin SDK rejection checks. Production build and git diff --check passed.
- External configuration: local readiness exited 1 because Google is disabled and Firebase settings are missing/malformed. Render/Firebase account configuration was not inspected. The owner reports hosted email OTP works.
- Real Google sign-in, browser popup/security headers, connected MongoDB OAuth flows and deployed social code remain unverified. Earlier isolated MongoDB diagnostic returned connect EACCES; the full suite was not rerun.

Commands actually run:

```powershell
cd C:\workspace\GharSeva-MERN
node --test server/test/firebase-social-unit.test.js server/test/password-login-unit.test.js server/test/external-auth-unit.test.js server/test/session-security-unit.test.js server/test/brevo-email-unit.test.js
npm.cmd run build
git diff --check
npm.cmd run integrations:check -- --google-ready
```

Readiness checks configuration syntax/readability only. They do not contact Firebase or validate credentials, IAM, domains or actual login. Local readiness does not prove Render's configuration. Tests cover mocked verified identity, wrong project/provider, expiry, verified email, explicit linking, collision, role/city preservation, logout and password-plus-email-OTP; mocks do not establish real sign-in.

## Firebase setup

1. Open Firebase console. Choose the stable existing project or create one if needed. In Project settings register a Web app, then obtain its public projectId, apiKey and authDomain.
2. In Authentication > Sign-in method enable Google, choose the requested support email and complete any shown Google consent/audience/test-user settings.
3. In Authentication > Settings > Authorized domains add gharseva-mern.onrender.com and the actual local hostname. The configured Vite host is 127.0.0.1:5173, so add 127.0.0.1 if using it; add localhost only when used. Enter hostnames without protocol or port.
4. Use the Firebase-provided authDomain, normally YOUR_PROJECT_ID.firebaseapp.com. Where Google OAuth requires an authorized redirect URI, use its exact Firebase handler: https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler. This project uses deliberate popup sign-in; it does not initiate full-page redirect login. Do not set the Render hostname as authDomain without configuring Firebase handlers there.
5. In Project settings > Service accounts obtain a private Admin credential for the same project. Keep the JSON outside the repository. Revocation checking requires suitable Firebase user lookup permissions; a syntactically valid key does not prove IAM access.

Official references:
https://firebase.google.com/docs/auth/web/google-signin
https://firebase.google.com/docs/auth/admin/verify-id-tokens

## Render setup

The existing code returns public web configuration from /api/auth/options at runtime. **No Firebase VITE build variables are required.** Configure these server settings privately in Render:

| Name                                           | Value                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- |
| AUTH_GOOGLE_ENABLED                            | true after enabling Google                                      |
| FIREBASE_PROJECT_ID                            | Exact stable Firebase project ID                                |
| FIREBASE_WEB_API_KEY                           | Public web app apiKey                                           |
| FIREBASE_AUTH_DOMAIN                           | Firebase auth hostname without protocol/path                    |
| GOOGLE_APPLICATION_CREDENTIALS                 | Private readable Admin JSON file path, if using the file option |
| FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY | Alternative matching inline Admin credential pair               |

Choose one Admin credential source. If the service supports private Secret Files, store the JSON there and set GOOGLE_APPLICATION_CREDENTIALS to its actual path, for example /etc/secrets/firebase-admin.json. Alternatively set both inline values privately in Render; literal newlines or escaped backslash-n are supported. If both sources are set, the inline pair takes precedence. Never put a private key, Admin JSON, JWT secret, Brevo or Razorpay secret in VITE variables, tracked files, browser assets, logs or chat.

Leave FIREBASE_AUTH_EMULATOR_HOST unset. Apple remains independent and may stay disabled. Preserve production/live settings, existing Brevo, MongoDB, JWT and identity-storage secrets, payment settings, Atlas access and HTTPS origin. Retain this start command:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

The social implementation is currently uncommitted. Review its full coherent file set in SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md, including overlapping local edits, before making your own selective commit. Do not use git add . blindly. Deploy the reviewed commit through the normal Render workflow and confirm its commit SHA and Live status. The usual production build must run when client code changes. Runtime Firebase setting-only changes require server restart, not VITE injection. Check /api/auth/options shows google true; this is readiness, not proof of successful sign-in.

## Owner-run test

Start with a deliberately selected isolated/staging dataset. A new-user test on the hosted site creates real account data; perform it there only if intended. Use an owned Google account and do not share tokens, passwords or OTPs.

1. On /login select Google, complete the popup and, for a new identity, enter the required real name, mobile, supported city, terms and your chosen password. Confirm the customer dashboard and saved city.
2. Log out. Protected pages should require authentication. Sign in again with the same linked Google identity: the same account and city should return without a second GharSeva email OTP.
3. If Google email matches an existing unlinked account, expect a collision. Sign in to that account with its existing password and email OTP, open Account settings > Sign-in methods & contact proof, enter its current password and explicitly link Google through the popup. Log out and retry. Email alone does not authorize merging.
4. A linked provider keeps its stored role, approval, documents and city. Pending providers remain restricted. Admin social sign-in/linking is denied.
5. Test a cancelled or blocked popup and unauthorized domain in a controlled setup. Show an understandable error and no app session; restore settings afterwards.

## Troubleshooting

Disabled Google: check the deployed SHA, /api/auth/options and server configuration; Apple is independent. Unauthorized domain: add the exact hostname and verify project/authDomain/handler. Popup blocked: allow popups and deliberately retry. Rejected verification: check same project, enabled provider, verified email and Admin IAM without exposing tokens. Existing-account collision: use explicit linking. For actual CSP/COOP browser failures record the specific directive/domain; do not disable security headers. Normal password login remains password then OTP to the stored email.

Configuration, mocks and an enabled button are not proof of real Google sign-in. Record successful popup, onboarding, session, logout and repeat sign-in before marking it verified.
