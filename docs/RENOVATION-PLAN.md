# GharSeva renovation: audit and implementation plan

Prepared for Sandip on 23 October 2026 from the supplied GharSeva ZIP.

Current implementation: [optional visit deposits and test ledger](PAYMENTS-UPDATE.md), [admin account invitations](ADMIN-INVITATIONS-UPDATE.md), [private provider identity review](PROVIDER-IDENTITY-UPDATE.md), [customer assistant](CUSTOMER-ASSISTANT-UPDATE.md), login/recovery and registration workflows are included. The backend passes **151 tests**. Local payments are simulations; a Razorpay test adapter needs owner configuration, and live keys are refused. Actual UIDAI authentication, live external identity/email/SMS/AI checks, gateway-account testing and public hosting remain pending. The next section is the earlier baseline audit, not the current completion status.

## What has been completed in this update

The supplied source was inspected, its dependencies installed, and its existing API test suite and React build executed. A separate temporary MongoDB database was seeded to check every included demo account. No personal Atlas database or external identity, payment, email or SMS account was used.

| Fresh check                            | Result                                    |
| -------------------------------------- | ----------------------------------------- |
| Original backend suite                 | 43 passed, 0 failed                       |
| Demo accounts by role                  | 1 customer, 12 providers, 1 administrator |
| Email and password login               | All 14 passed                             |
| Mobile number and password login       | All 14 passed                             |
| Signed-in account lookup               | All 14 passed                             |
| Incorrect password                     | Rejected with HTTP 401                    |
| Customer opening the admin API         | Rejected with HTTP 403                    |
| React production build                 | Passed                                    |
| Backend suite after the security patch | 46 passed, 0 failed                       |

The mobile login currently uses a password. It does not deliver an SMS code. These are backend checks and a production build; there was no new browser visual review or Windows test in this update. Older browser results in VERIFICATION.md are historical and should not be treated as new results.

### First security patch

Before this patch, changing a password cleared the browser's cookie but a saved copy of the previous session still returned HTTP 200 from `/api/auth/me`. A session version is now included in newly issued tokens and checked against the account on authenticated requests. A successful password change atomically changes the hash and increments that version, invalidating previous sessions. Sessions issued before this patch remain compatible until that account changes its password.

Concurrent changes cannot both overwrite the same original password. The internal version is omitted from account responses. Three regression tests cover session revocation including legacy cookies, rejected password changes, and concurrent password changes.

Changed source files: `server/src/auth.js`, `server/src/models.js`, `server/src/app.js`, and `server/test/api.test.js`. Existing data does not need to be deleted or reseeded. This is the first security patch and renovation plan, not the completed redesign or the external integrations.

## Current state of the requested features

| Request                           | Found in the supplied project                                      | Planned result                                                                                |
| --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Redesign all pages                | Existing public pages and dashboards                               | One shared visual system and responsive layouts across every journey                          |
| Three role logins                 | One login endpoint and role-protected dashboards                   | Clear customer/provider entry and a dedicated restricted admin entry                          |
| Google, Apple and phone OTP login | Absent                                                             | Verified external identities linked to the correct local account                              |
| Suggested strong passwords        | Registration already uses `autocomplete="new-password"`            | Preserve password-manager compatibility, add clear rules and strength feedback                |
| Submitted provider requests       | Admin can see providers and approve/reject                         | Dedicated application queue with filters, history and correction requests                     |
| Incomplete applications           | Not stored; an account is created only on a valid final submission | Opted-in, authenticated drafts with progress and controlled admin follow-up                   |
| Customer AI helper                | Existing finder uses fixed rules                                   | Conversational service discovery with live provider/slot lookup and confirmed booking         |
| Provider AI helper                | Absent                                                             | Help write service descriptions and explain missing application information                   |
| Aadhaar verification              | Supporting file upload and manual review only                      | Clearly separated sample-document demo and a properly onboarded real verification integration |
| SMS/email OTP                     | Visit code appears in the dashboard only                           | Separate contact verification/login/recovery flows using delivery providers                   |
| Admin AI                          | Absent                                                             | Checklist and document-text assistance, with human decisions and recorded reasons             |
| Admin creates customers/providers | Absent; existing admin route only updates status/approval          | Create or invite with fixed allowed roles, onboarding, consent and audit records              |
| Online payment                    | Pay on site; no gateway or payment ledger                          | Razorpay test checkout, verified server events and payment/refund records                     |
| Hosted URL                        | No deployed URL supplied                                           | HTTPS Node hosting plus persistent MongoDB and correct production configuration               |

## Product and design direction

Keep the React JSX, Express, Node.js and MongoDB stack so it remains a MERN college project. Improve the existing booking and approval logic rather than discarding it.

Use warm off-white surfaces, forest green actions, charcoal text, consistent spacing and restrained amber highlights. Use service imagery relevant to each category. Seeded people, photos and reviews must remain visibly identified as demonstration content. Never present sample profiles as real identity-verified professionals.

The customer journey should be simple: describe a problem, find suitable services, compare available providers, review an estimate, select a slot, confirm a booking, track it, and review the completed work.

The provider journey should focus on application progress, missing requirements, available work, schedule and payment history. The administrator should have a searchable work queue rather than repeatedly downloading every record into a single overview. Split the large Dashboard.jsx into smaller role-specific modules as those pages are rebuilt.

## Login and registration

Use Firebase Authentication for Google/Apple and Twilio Verify for phone OTP, while Express continues to own GharSeva roles, approval status, bookings and its HttpOnly session. Verify identity tokens on the server and map the verified Firebase UID to a local account. The browser must never choose an admin role or grant provider approval.

Keep the existing password hashes working during migration. Social-only and phone-only identities will require a deliberate schema change because email, mobile and passwordHash are currently mandatory. Collect genuinely missing contact/profile information during onboarding; do not manufacture placeholder emails or passwords. Linking a new sign-in method to an existing account must require proof of the existing account, not just a matching typed email. Apple private-relay addresses need explicit handling.

Add forgot-password recovery, explicit email/phone verification state, useful error messages, accessible labels, password visibility and session expiry handling. Use a separate restricted admin sign-in page and MFA before public use. Login method does not change a user's role or bypass provider review.

The browser or password manager decides whether to suggest a password. The website can support this through correct fields and autocomplete values, but cannot guarantee a Google-generated suggestion on every device.

For numeric email codes, use a server-side transactional email service. Firebase email-link sign-in is a different flow and should not be described as a numeric email OTP. Protect short codes with a keyed digest, a short expiry, limited attempts and resend throttling. Do not return production codes in API responses or log them. Contact verification codes, password recovery codes and the existing visit-start code must remain separate.

## Provider applications and incomplete forms

Suggested steps: verified contact, services/experience, service area/schedule, supporting documents, review and submit. Save only the applicant's chosen draft fields after a clear notice and opt-in. Offer a separate optional permission for staff to contact them about an incomplete application. Do not silently collect each keystroke or store passwords in drafts.

Use a separate ProviderApplication record rather than creating a publicly searchable provider from a half-completed form. Restrict draft access to the authenticated applicant; show only necessary, consented lead information to authorised admin staff. Verify contact ownership before enabling follow-up. Include deletion, withdrawal and configurable retention; a 30-day draft retention period is a proposed product default, not a statement of a legal requirement.

Suggested application states: DRAFT, IN_PROGRESS, SUBMITTED, NEEDS_CORRECTION, UNDER_REVIEW, APPROVED, REJECTED and WITHDRAWN. Treat ABANDONED as an inactivity flag on an unfinished application, so resuming it is straightforward. Show last activity, completed steps, missing fields, submitted documents and review history.

Admin-created accounts should use an invitation or verified onboarding flow. Providers created by an administrator still require the same document review. Do not email readable passwords or create public self-registration for administrators.

## AI features

For customers, ask a few relevant follow-up questions, recommend a service category, explain likely possibilities, and retrieve only actual active, approved providers. Provider suggestions should explain practical factors such as service, area, price and available time. An AI message is not a confirmed diagnosis of a household fault or an authoritative quote. Dangerous electrical/gas situations need a brief safety response and appropriate professional help, not hazardous repair instructions.

The AI may prepare a booking draft using information the customer provides or authorises from saved details. Show provider, service, date/time, address and price basis for explicit confirmation before creating a booking or initiating payment. The server must recheck ownership, availability and current prices. Use request identifiers to prevent duplicate bookings after retries. If the model is unavailable, keep the ordinary service search and booking form available.

For providers, help improve descriptions, understand document requirements and prepare responses for the provider to review. Do not invent qualifications, experience or identity details.

For administrators, use deterministic checks for missing fields and an optional AI summary of permitted document text. OCR/name comparison can flag a possible mismatch, with the original evidence visible to the reviewer. Spelling, initials, transliteration and OCR mistakes must be considered. AI should not autonomously rank applicants for work suitability or approve/reject access to earning opportunities. The administrator records the final decision, reason and correction opportunity. Do not send raw Aadhaar images, numbers or unrelated sensitive information to a general chatbot.

## Aadhaar and identity checks

Uploading an image or finding matching names does not prove Aadhaar authenticity or that the applicant owns the document. Identity verification and professional skill checks are separate.

For classroom development, keep fictional documents and label the status as a demonstration/manual review. For a real integration, first establish the applicable UIDAI/verification-provider onboarding, consent, permitted verification method and data-handling requirements. UIDAI's current offline ecosystem uses consent-based sharing and cryptographically verifiable information. Do not assume a college app can access UIDAI authentication APIs directly or send Aadhaar OTPs itself.

Design for minimal retained data and restricted access, with an appropriate alternative document route. Store verification results and necessary references instead of unnecessary full identity numbers. Real Aadhaar activation is a separate integration milestone, not a badge we can truthfully add after a file upload.

## Payment design

Razorpay Standard Checkout is a practical first choice for an India-focused classroom implementation. Start with test keys. Live transactions depend on the merchant's account activation and current provider requirements.

Calculate amounts from the database, create the order on the server, verify the checkout signature on the server, and reconcile captured payment status using authenticated provider data and signed webhooks. Verify amount, currency and booking ownership. Handle duplicate events idempotently. Keep separate booking and payment states, expiry/release of temporary slot reservations, failed/cancelled payment recovery and refunds.

The current API requires a custom request-verification header on every write. A payment webhook cannot be expected to send that application header; it needs a narrowly scoped endpoint that authenticates the payment provider's raw-body signature instead. Update the strict Content Security Policy for the specific authentication and checkout origins required by the integrations.

Begin with fixed-price service packages or a clearly labelled visit deposit, since the current price is a starting estimate. Any additional charges need customer approval. A demo earnings ledger is not an automatic payout system for service providers; marketplace settlement is a separate integration.

## Hosting

Use an HTTPS Node-capable host for Express and MongoDB Atlas for persistence. Serving the React build and `/api` from the same origin fits the current relative API paths and cookies. Render is one available Node/Express host; choose the actual account/plan when deploying. Static-only hosting of client/dist will not run this backend.

Prepare a repeatable production build/start configuration, environment validation, controlled demo seeding, strong secrets, Atlas access rules, permitted OAuth/OTP domains, webhook URLs and a correctly configured trusted reverse proxy. Keep payment, email, AI and database secrets on the server. Use persistent private storage for documents if moving files out of MongoDB. Do not host using npm run demo: that database is temporary.

Verify the hosted customer-to-provider-to-admin booking journey, callback URLs, private document access, failure recovery, mobile layouts and database persistence before relying on the URL for the faculty presentation.

## Implementation sequence and completion criteria

| Stage                                  | Deliverable                                                                                | Completion check                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 0: baseline, completed here            | Audit, session revocation fix and this plan                                                | 46 API tests pass; original React build passes                                                                       |
| 1: authentication and shared design    | Reusable components; new login/register/admin entry; verified sign-in and recovery         | Real configured flows work for each allowed role; bad/expired codes and account linking tested                       |
| 2: provider onboarding and admin queue | Step forms, consented drafts, resume, correction flow, invitations and audit history       | Half-complete saved application resumes; only permitted staff see consented leads; approval controls remain enforced |
| 3: public and role pages               | Home, services, details, booking, customer/provider/admin dashboards, support and policies | Complete ordinary booking journey works on desktop/mobile and with keyboard navigation                               |
| 4: AI assistance                       | Customer discovery/booking drafts, provider writing assistance, admin checklist summaries  | Actual database tools; confirmation before booking; no automatic applicant rejection; failure fallback works         |
| 5: payments and notifications          | Razorpay test checkout, payment history, signed events, receipts and OTP delivery          | Success/failure/refund/duplicate webhook and delivery-limit tests pass                                               |
| 6: final verification and hosting      | Persistent deployment, demo walkthrough and updated documentation                          | Stable HTTPS URL, persistent data, real callback tests and successful full presentation journey                      |

Build the identity-verification interface during stage 2 using sample records. Activate real Aadhaar verification only when the appropriate integration is available. Apple can be completed once the developer account and website configuration are ready; Google/phone and email verification need not wait for it.

Additional improvements with clear value: transparent service packages, booking issue photos with access controls, customer-approved extra-work quotes, in-app notifications, cancellation reasons, support tickets, accessible loading/error/empty states, and honest reporting of payments versus estimated service value. Keep features tied to the demonstration journey rather than adding screens with no working purpose.

## Setup needed for live integrations

Firebase project with enabled providers and permitted domains; Apple Developer configuration for Apple sign-in; transactional email credentials and sender setup; an AI API project with usage limits; Razorpay test credentials and webhook secret; persistent Atlas and a Node hosting account. Billing or account verification may apply. Use server environment variables or the host's secret settings, not a chat message or committed source file.

No external account has been created, no paid service activated, no message sent, and no public deployment performed in this update.

## Official integration references

- [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase Apple sign-in and developer prerequisites](https://firebase.google.com/docs/auth/web/apple)
- [Firebase phone OTP, consent and abuse protection](https://firebase.google.com/docs/auth/web/phone-auth)
- [UIDAI offline-verification ecosystem, Government of India, 20 April 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2253755&lang=1&reg=1)
- [Razorpay Standard Checkout integration and server verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Render Node/Express deployment](https://render.com/docs/deploy-node-express-app)
- [MongoDB Atlas IP access controls](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
