> Current integration review: [FINAL-HOSTING-REVIEW.md](FINAL-HOSTING-REVIEW.md). The shared login and security contract below supersede older milestone descriptions.

# Registration integrations: setup and testing

This project now contains the registration workflow and delivery adapters. No Google, Apple, SMTP or Twilio account has been connected on your behalf. Do not describe live delivery or external sign-in as tested until you complete the checks below.

## 1. Run the complete classroom demonstration first

Use Node.js 22.12 or newer. From the extracted project root in PowerShell:

```powershell
npm.cmd ci
npm.cmd run demo
```

Open `http://localhost:5173/register` for customers or `http://localhost:5173/register?role=provider` for an individual professional.

1. Choose email or mobile, enter fictional contact details and request a code. The page clearly displays a **classroom demo** code. No message is sent.
2. Enter that code. Customer registration then collects the existing required name, email, mobile and password fields.
3. For a professional, choose **Save my application progress** if you want a saved draft. Saving is off by default. Staff follow-up is a separate optional permission, also off by default.
4. Enter partial details. After about one second, the saved-state message confirms persistence. Close the page or end that registration session. Verify the same primary contact again to restore the draft. Passwords and selected files must be entered again.
5. Sign in separately as `admin@gharseva.com` / `Admin12345`, then open **Registration requests**. Incomplete drafts appear there. Without follow-up permission, the contact is masked. Inactive means no saved activity for at least 24 hours; it is not a rejection.
6. Finish the provider steps, select the included fictional `server/fixtures/demo-document.pdf`, review the summary and submit. The provider account is created as pending, and its application is retained in the same queue.
7. In the administrator queue, inspect the supporting document, enter a review note of at least 10 characters and approve, request correction or reject. Decisions are manual. Applicants see the review history under **My application**.
8. After approval, find the professional under each selected service category. The booking form offers those categories and records the selected one. A professional cannot be double-booked across categories.

The temporary demo database resets when `npm run demo` stops. For persistent records, follow `START-HERE.md` with your MongoDB connection and configure verification below. Existing accounts and bookings are not deleted or reseeded by these changes.

## 2. Server configuration

Copy `server/.env.example` to `server/.env`. Keep credentials on the server. The frontend obtains only public Firebase web configuration from `/api/auth/options`; no server private key is returned.

- `MONGODB_URI`: your existing MongoDB connection.
- `JWT_SECRET`: retain a stable, private random secret. Sessions and the private application contact lookup depend on it. Changing it invalidates sessions and changes draft lookup keys; plan a migration before rotating it on a database with saved drafts.
- `CLIENT_ORIGIN`: exact frontend origin, including scheme and port for development. Use your HTTPS origin in production.
- `REQUIRE_VERIFIED_REGISTRATION=true`: enforce proof for legacy registration clients in development too. Production enforces it regardless. The new UI always requires proof.
- `GHARSEVA_DEMO=false` and `AUTH_DELIVERY_MODE=live` for a persistent/live server.

Production refuses to start with either demonstration switch enabled. The test delivery facility is enabled only when **both** `GHARSEVA_DEMO=true` and `AUTH_DELIVERY_MODE=test` are present outside production. Do not expose classroom test mode publicly: it deliberately returns test codes to the requesting page.

Existing email/password and mobile/password sign-in both require a code delivered to the stored account email. Old accounts are not automatically marked contact-verified for recovery. Open **Account settings → Sign-in methods & contact proof**, and verify saved contacts for recovery/contact proof. Administrators also require password followed by email OTP. Standalone contact-code login is refused. Google/Apple cannot create an administrator session.

## 3. Google sign-in through Firebase

1. Create a Firebase project and add a web application. Copy its web `apiKey`, `authDomain` and `projectId` into `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN` and `FIREBASE_PROJECT_ID`.
2. In Firebase Authentication, configure the Google sign-in provider and its support email.
3. Add `localhost` and your deployed frontend hostname under Authentication's authorised domains. Do not assume a newly created project has localhost enabled automatically.
4. Create a server service account using Firebase's Admin SDK/service-account settings. Keep its JSON outside this project and set `GOOGLE_APPLICATION_CREDENTIALS` to that private file's absolute path. Alternatively set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` using your hosting service's secret environment variables. Use one credential approach.
5. Set `AUTH_GOOGLE_ENABLED=true`, restart the API and reopen the page. The Google control becomes enabled when public configuration and server credentials are present.
6. Test signup with a new Google identity. The server verifies a Firebase ID token, including revocation, provider, verified email and recent authentication. Complete the required GharSeva details and password. The UID is linked to that newly created local account.
7. Sign out and test Google sign-in. For an existing password account, sign in first and use **Account settings** to link Google after confirming the current GharSeva password. A matching typed email alone does not link identities.

External sign-in does not alter local roles, provider approval or suspension. Google/Apple sessions use the existing HttpOnly GharSeva session after server validation. Firebase browser persistence is in memory; the SDK is loaded only when an enabled external method is selected.

Official references: [Google web sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Admin ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [revoked-token checks](https://firebase.google.com/docs/auth/admin/manage-sessions).

## 4. Apple ID sign-in through Firebase

1. Complete the same Firebase/server setup as above. Use an Apple developer account with Sign in with Apple configured for your website.
2. Create the identifiers, Services ID, web domain/return URL and signing key required by Apple's web configuration. Follow the Firebase Apple guide for the exact return URL associated with your configured Firebase auth domain.
3. Enable Apple in Firebase Authentication and supply the Services ID, Team ID, Key ID and private signing key in Firebase's Apple provider settings. Do not put Apple's private key in React.
4. Set `AUTH_APPLE_ENABLED=true` and restart the API. Test popup/callback behaviour on the authorised HTTPS domain and supported browsers.
5. Test both Apple's shared-email and private-relay choices. Private-relay signup requires explicit consent before associating that identity with the submitted GharSeva name/mobile details. Names can be absent on later Apple sign-ins; collect a missing name in GharSeva rather than inventing it.
6. If sending emails to Apple relay addresses, configure Apple's private email relay with the sender domains/addresses used by your SMTP service. Check delivery to those addresses explicitly.

A provider account still needs both the existing contact fields and a local password during initial onboarding; external identity proof does not bypass professional document review.

Official reference: [Apple web authentication and private-relay requirements](https://firebase.google.com/docs/auth/web/apple).

## 5. Email numeric OTP through SMTP

Use an SMTP account from a transactional email provider. Verify the sending address/domain in that provider, then fill in the exact values it supplies:

```dotenv
SMTP_HOST=your_provider_smtp_hostname
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password_or_api_key
SMTP_FROM=GharSeva <verified-sender@your-domain.example>
```

Port 587 requires STARTTLS; port 465 uses TLS from connection start. Certificate checking stays enabled. No actual credentials belong in `.env.example` or a downloadable ZIP.

Restart the API and request a code using an email inbox you control. Confirm that the message arrives, the code is not shown by the live API, wrong/expired/used codes fail, and requesting another code is throttled. Repeat for registration and the existing account's password-then-email-OTP login. Mobile/password must still deliver to the stored email. These are numeric email codes sent by this backend, not Firebase email links.

Official reference: [Nodemailer SMTP transport](https://nodemailer.com/smtp).

## 6. SMS OTP through Twilio Verify

1. Create a Twilio account and a Verify Service. Obtain the Account SID, Auth Token and Verify Service SID from your account's settings.
2. Configure:

```dotenv
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid
```

3. Enable the destination countries you actually support and complete Twilio's current sender, regulatory and account requirements for those destinations. This version accepts Indian ten-digit mobile numbers and sends them in `+91` format.
4. Restart the API. Request a code for a phone you control. Twilio sends and verifies the live SMS code; this project does not generate a pretend live SMS confirmation.
5. Test registration, saved-draft resumption and authenticated contact proof. Phone OTP is not a sign-in method. Check invalid, expired and repeated-code handling. Check delivery failures and provider-side limits with your configured account.

Official references: [send a verification](https://www.twilio.com/docs/verify/api/verification), [check a verification](https://www.twilio.com/docs/verify/api/verification-check).

## 7. What to verify before using a public URL

Run `npm test` and `npm run build`. Use HTTPS, keep live delivery credentials private, confirm authorised domains/origins and test the deployed Google/Apple popup flows. The backend CSP already includes the Firebase API/auth-domain and Google API origins used by this integration; review any custom auth-domain changes with your deployment.

Verify that the new MongoDB indexes exist, including the application/session uniqueness indexes and challenge/session/draft expiry indexes. The application also checks expiry in queries; TTL cleanup can run after the expiry time rather than at the exact second.

Test saved-draft ownership, follow-up contact masking, document privacy, correction/resubmission, suspension and all three role permissions on your deployed database. Do not run `syncIndexes` or drop collections as an upgrade step: the new fields are optional for existing users, and the original required-contact schema is preserved.

Codes expire after 5 minutes, allow at most 5 checks and have per-contact/IP request limits. Registration proof expires after 30 minutes. Incomplete drafts expire 30 days after the latest save. Draft passwords/files are not retained. Submitted documents remain private and manually reviewed.

Real Aadhaar authentication, document OCR, AI eligibility decisions, payment processing and public hosting remain separate milestones. Verified-contact password recovery is now included; see the login/recovery section below. The admin checklist is explicitly rule-based, and only the administrator decides approval/rejection.


## 8. Shared login and password recovery (current)

All roles use /login. /customer/login, /provider/login and /admin/login are aliases. Email/mobile plus password is followed by mandatory registered-email OTP. The browser does not select a login role; the database role determines permissions and the dashboard. There is no password-only or standalone email/phone-code login.

A pending provider can sign in and finish their application without public approval. Linked Google/Apple customers/providers sign in directly after Firebase verification; admins cannot. Existing-account linking requires a completed local authenticated session and current password, never a typed matching email.

Password recovery remains limited to eligible verified-contact customer/provider accounts. It does not sign in or reset an admin password. Password changes revoke prior sessions; session records now also support exact-browser logout and administrator idle expiry. See [SESSION-SECURITY-UPDATE.md](SESSION-SECURITY-UPDATE.md).

External flows use popups, with actionable cancellation/blocking errors. The shared login offers an explicit interrupted-redirect recovery action; it only checks Firebase's existing redirect result and sends the result for normal server verification. It does not initiate redirects or automatically link accounts. Browser storage restrictions and custom auth-domain hosting must still be checked against Firebase's redirect guidance before relying on redirect recovery. No real Google or Apple transaction was verified during the final review.
