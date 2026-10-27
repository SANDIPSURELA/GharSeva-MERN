> **Render Free email update, 27 October 2026:** use [EMAIL-OTP-RENDER.md](EMAIL-OTP-RENDER.md) for Brevo HTTPS delivery. SMTP is still supported on suitable hosts. Password then registered-email OTP remains mandatory for all roles; a mobile identifier does not require SMS.

# Current login setup (25 October 2026)

Password sign-in for all three roles now means: registered email or +91 mobile plus password -> Continue -> registered-email OTP -> Verify & sign in. The shared page is /login for customers, professionals and administrators. /customer/login, /provider/login and /admin/login redirect there. No account-type selector is used. Public Google/Apple sign-in remains direct for linked identities.

## Security contract

POST /api/auth/login accepts identifier and password, with no portal or role selection, and returns HTTP 202 with a restricted HttpOnly pending cookie. The server snapshots the database role in the existing pending record; legacy browser role/portal fields are ignored for password and external login. It returns no user or authenticated session. The server chooses the saved email; browser-supplied destinations/user IDs cannot choose the account.

Codes expire in five minutes and are stored using keyed digests. Five failed attempts exhaust a challenge. Resends wait 60 seconds, invalidate all prior codes, preserve failed attempts and cannot extend the ten-minute password-proof deadline. Account delivery limits also apply across browsers: five emails per 15 minutes and a 60-second gap. POST /api/auth/login/verify consumes a challenge atomically and rechecks status, role, password/contact snapshot, contact revision and session version. DELETE /api/auth/login/pending cancels it.

Standalone email/phone-code login requests and old login challenges are refused. Registration, authenticated contact proof, recovery and visit OTP remain separate. Existing eight-hour sessions (including legacy version-zero sessions) retain their current lifetime; do not rotate JWT_SECRET for this deployment. Pending providers remain pending. Existing customer booking/finder return paths are preserved.

## Restart before review

Restart the API from its owning terminal to load the update. For persistent MongoDB, use the existing database URI and stable secrets with the development command below. Do not stop a classroom memory demo expecting its current data to survive: its temporary database is discarded on exit. Vite hot reload alone cannot update an older API process. Do not run demo and persistent development on the same ports.

## Classroom demo: on-screen codes, no email

From PowerShell:
```powershell
cd C:\workspace\GharSeva-MERN
npm.cmd run demo
```

The existing launcher explicitly sets AUTH_DELIVERY_MODE=test and GHARSEVA_DEMO=true and uses its own temporary MongoDB with fictional accounts. It does not reset your persistent database. It discards its own records on exit. Changing .env cannot enable real delivery in this launcher.

Demo customer: customer@gharseva.com / Customer123.
Demo professional: provider@gharseva.com / Provider123.
Demo administrator: admin@gharseva.com / Admin12345.

The second screen labels the displayed code Classroom demo and says no email was sent. External sign-in is never simulated.

## Real email locally

Use configured persistent MongoDB. Keep the existing URI and JWT_SECRET. Do not seed/reset your existing database. If server/.env is missing, copy server/.env.example once; otherwise edit necessary settings without overwriting existing settings.

Set server-side values:
```dotenv
NODE_ENV=development
MONGODB_URI=your_existing_persistent_mongodb_uri
JWT_SECRET=your_existing_stable_secret
CLIENT_ORIGIN=http://localhost:5173
PORT=5000
AUTH_DELIVERY_MODE=live
GHARSEVA_DEMO=false
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_app_password
SMTP_FROM=your_authorized_sender
```

Keep secrets out of React and source control. The existing Nodemailer adapter uses STARTTLS on 587 or implicit TLS on 465. Your SMTP account must permit this sender; the computer/network must allow outbound SMTP and MongoDB connections.

```powershell
cd C:\workspace\GharSeva-MERN
npm.cmd run dev
```

This runs node --watch src/index.js (loading server/.env) and Vite, without seeding. Open http://localhost:5173.

Use a real account whose saved email inbox you control. A separate test customer can register with an owner-controlled inbox. Do not silently replace demo emails. For every role, use /login and an existing account with an accessible registered inbox. The stored role determines the dashboard.

Both email/password and mobile/password must show the same masked saved email. A fresh client has no protected API access before OTP. Check wrong code, resend after 60 seconds, expiry, back/change account and the final role/booking redirect. Live responses, logs and UI never expose a code. Missing/failed delivery does not authenticate or fall back to demo.

## Hosting

Build with npm run build; start with npm start. Use NODE_ENV=production, live delivery, GHARSEVA_DEMO=false and exact HTTPS CLIENT_ORIGIN. Preserve the existing database, JWT_SECRET and identity encryption key.

The host must allow outbound SMTP. Render Free blocks ports 25, 465 and 587, so standard SMTP email cannot work on that instance type. Choose an SMTP-capable hosting configuration. No second email provider was added.
Reference: https://render.com/docs/free#outbound-port-blocking

## Firebase and Apple

Configure FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_AUTH_DOMAIN and either GOOGLE_APPLICATION_CREDENTIALS (private service-account file outside the project), or FIREBASE_CLIENT_EMAIL plus FIREBASE_PRIVATE_KEY in server secrets. Enable AUTH_GOOGLE_ENABLED and/or AUTH_APPLE_ENABLED only when configured.

In Firebase enable the corresponding Authentication providers, register the web app, and authorize localhost and your hosted domain. Newer Firebase projects do not automatically authorize localhost. Complete Google's provider/OAuth consent configuration.

Apple requires Apple Developer Program membership, a primary App ID, Services ID, Team ID, Key ID and signing key configured in Firebase. Set the Apple Return URL to https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler (or the configured custom auth domain equivalent). Register your actual SMTP sender/domain for Apple's private relay and satisfy its email authentication requirements. Configure Firebase's sender separately if Firebase sends email. Both @privaterelay.appleid.com and @private.icloud.com relay domains require consent.

Firebase Admin verifies token validity/revocation and enabled provider. The app checks verified email and recent authentication. Linked Firebase UID/provider mappings select accounts; typed emails do not. Stored roles, suspensions and provider approvals apply. Admin external login is refused.

Unknown identities enter existing onboarding to collect actual missing details. No account is auto-merged by matching email. Existing users must complete authentication, then use Account settings -> Sign-in methods & contact proof, confirm their password and choose Link Google/Apple. Apple relay linking requires explicit consent. An identity cannot be moved from another account.

References:
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/apple
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/
- https://developer.apple.com/news/?id=1ptvdtcm

## Checks

```powershell
cd C:\workspace\GharSeva-MERN
node --test server/test/password-login-unit.test.js
node --test server/test/login.test.js
npm.cmd test
```

The first suite uses mocked persistence/delivery in process. The second uses real disposable MongoDB plus HTTP, including competing OTP submissions and recovery. Existing workflow fixtures complete both HTTP login steps. npm test builds and runs all server suites. MongoDB/HTTP tests require localhost connections and writable temporary storage.

After restarting the API, review customer/customer alias, professional and admin routes at desktop and 360px width; password visibility, OTP paste/autocomplete/focus, resend countdown, expiry, back action and role/booking redirects. Google/Apple display Setup needed until configured.

Current shared-login results and unverified work are recorded in SHARED-LOGIN-UPDATE.md. LOGIN-UPDATE-RESULTS.md records the earlier separate-page milestone. No real email or live Google/Apple authentication was tested in this session.

