> Historical milestone results only. Current working-folder verification and remaining blockers: [FINAL-HOSTING-REVIEW.md](FINAL-HOSTING-REVIEW.md).

# Verification report

## 24 October 2026 — optional visit deposits and test ledger

**151 backend tests pass** with 23 new payment checks; the React production build passes. Tests verify owner/role controls, server-derived amounts, optional-deposit acceptance, eligibility, duplicate order protection, signature and gateway-state checks, pending authorisation, raw-body signed webhooks, duplicate/out-of-order/concurrent events, refund reconciliation, cancellation flags, uncertain-order recovery and refusal of live keys. Gateway transport is mocked: no external Razorpay API or checkout transaction was executed. Browser fixtures verify local failure/retry/success, receipts, admin refund controls and ledger/dialog layouts at 320–1440 pixels without horizontal overflow. Live gateway checkout/webhooks, Windows/other browsers and hosting remain unverified. See [PAYMENTS-UPDATE.md](PAYMENTS-UPDATE.md).

## 24 October 2026 — admin account invitations

**128 backend tests pass** with 16 new invitation checks; production build passes. Tests use Express/temporary MongoDB for contact binding, fixed roles, hashed/expiring/revocable tokens, competing acceptance, customer/provider registration, failure cleanup and review requirements. Browser fixtures cover invitation creation, search, revoke/cancel/confirm and responsive layouts from 320 to 1440 pixels. Complete browser credential entry and live delivery remain unverified. See [ADMIN-INVITATIONS-UPDATE.md](ADMIN-INVITATIONS-UPDATE.md).

## 24 October 2026 — provider identity document review

**112 backend tests pass**, including 23 new verification tests. An actual local Tesseract OCR run reads the clearly labelled fictional sample and extracts “Surela Sandip Rajubhai”. API tests cover reordered/additional name components, initials and unclear text, registration-name discrepancies, owner/admin access, encryption, consent and masking acknowledgements, alternative evidence, detected full-number refusal before storage, damaged/undersized images, manual review requirements, correction/replacement/withdrawal, stale and competing reviewers, evidence expiry, upload throttling, approval locks, both listing-approval routes, production key refusal and new registration/profile-edit enforcement. Existing accounts and ordinary registration, login, application and booking tests continue to pass. The production React build passes.

Browser checks use isolated fictional fixtures, with the actual local OCR reader for sample-image upload. Provider upload, previews, matching output, admin correction and recorded-review controls work; completed review leaves the listing pending. Provider and admin record layouts have no horizontal document overflow at 320, 390, 768, 1024 and 1440 pixels; the upload form also passes at 320 pixels and the alternative-document option makes the back side optional. Mobile and desktop layouts were visually inspected. Browser fixtures do not prove real session behavior: the Express/MongoDB suite separately checks those permissions and mutations. No real Aadhaar was uploaded or externally authenticated, and no external OCR service was called. Windows, other browsers, degraded-photo OCR accuracy and production deployment remain unverified. See [PROVIDER-IDENTITY-UPDATE.md](PROVIDER-IDENTITY-UPDATE.md).

## 24 October 2026 — customer service assistant

The backend passes **89 tests**, including 13 new assistant tests. Actual catalog/provider matching, filter and hazard handling, AI consent/fallback, owner-only expiring booking drafts, price/role tamper rejection, explicit confirmation, changed availability/prices, cross-category slot conflicts and idempotent concurrent confirmation pass against Express and temporary MongoDB. The Responses adapter contract and redaction use mocked HTTP; no live OpenAI key was configured or called. The React production build passes. Browser fixture checks cover guided results, budget/no-results, urgent guidance, anonymous login redirect, restored provider choice, slot/address entry, draft review/edit and a confirmation receipt. Initial and booking layouts were checked at 320, 390, 768, 1024 and 1440 pixels without horizontal document overflow; mobile results were visually reviewed. Real API behavior and browser fixture behavior are separate checks. Live AI quality/account access, live external identity/email/SMS delivery, Windows/other browsers and hosted journeys remain unverified. See [CUSTOMER-ASSISTANT-UPDATE.md](CUSTOMER-ASSISTANT-UPDATE.md).

## 24 October 2026 — login requirements and recovery

The backend passes **76 integration tests**. All 14 seeded accounts passed email/password and +91 phone/password login through their stored role entry. New tests cover wrong-role rejection, customer/provider OTP login, pending-provider access, immutable code purposes/portals, verified-contact recovery, confirmation matching, legacy version-zero recovery, generic ineligible replies, expiry, suspension/contact changes, disabled demo proof, competing resets, previous-session revocation and outstanding-code invalidation. The React production build passes. Browser checks cover visible login methods, empty-form errors/focus, empty-field visibility toggles, provider/admin protected-route redirects, role/recovery links and responsive layouts from 320 to 1440 pixels. They use isolated visual fixtures; actual account operations use Express and temporary MongoDB. Live Google/Apple sign-in, real email/SMS delivery, password-manager suggestions, Windows/other browsers and a complete browser credential-to-dashboard/reset journey remain unverified. See [LOGIN-REQUIREMENTS-UPDATE.md](LOGIN-REQUIREMENTS-UPDATE.md).

## 23 October 2026 — complete registration workflow

The current backend passes **65 integration tests**. All previous authentication, permissions, document, approval, booking and review checks pass. New checks cover contact proof, code expiry/reuse/attempts, resend races, opted-in draft storage and ownership, privacy/follow-up permissions, revision conflicts, inactive/expired drafts, pending provider submission, review-note/document checks, competing manual decisions, secondary-service booking and production demo-mode refusal. The production build passes. Customer verification/detail pages, professional entry/service pages and the admin queue were checked from 320 to 1440 pixels without horizontal document overflow. Browser interaction checks include multiple service selection, saved-progress feedback, missing-document validation and application filters. Browser checks use isolated visual fixtures; real account/session/application operations use temporary MongoDB through the API suite. Live Google/Apple, email/SMS delivery, Windows and a full browser signup journey remain unverified. See [FULL-REGISTRATION-UPDATE.md](FULL-REGISTRATION-UPDATE.md) and [REGISTRATION-INTEGRATION-SETUP.md](REGISTRATION-INTEGRATION-SETUP.md).

## 23 October 2026 — customer registration page milestone

The customer signup page now matches the login redesign and uses four fields, password-manager autocomplete, live password requirements, explicit terms/privacy agreement, field errors and a compact mobile layout. All **50 backend integration tests pass**, including three new tests covering real customer registration, hashed passwords, sessions, email/mobile login, duplicate contacts and invalid submissions. The React production build passes. Browser layout checks passed at widths from 320 to 1440 pixels without horizontal document overflow; empty-form validation/focus, password visibility and customer/provider/login navigation passed. Visual checks used isolated API fixtures; actual account operations were verified separately against Express and temporary MongoDB. A completed browser signup journey, browser password suggestions, Windows and live external authentication were not checked. See [CUSTOMER-REGISTRATION-UPDATE.md](CUSTOMER-REGISTRATION-UPDATE.md).

## 23 October 2026 — login page milestone

The login page has been rebuilt with scoped CSS, responsive form/photograph layouts, field validation, password visibility, support links and a dedicated administrator entry. The current backend suite passes all 47 tests, including the new administrator-entry role check; the production build passes. Browser layout checks passed at widths from 320 to 1440 pixels with no horizontal document overflow. Validation/focus, empty-field visibility toggle, support disclosure and administrator/provider-registration navigation were checked in the browser. These browser checks used isolated API fixtures because the supervised preview could not run MongoDB; real authentication and booking integration were tested separately against temporary MongoDB. Windows and a complete credential-to-dashboard browser journey were not checked in this milestone. See [LOGIN-PAGE-UPDATE.md](LOGIN-PAGE-UPDATE.md) for scope and reproducible commands.

## 23 October 2026 — renovation baseline and session fix

Fresh API checks passed for email/password and mobile/password login and authenticated account lookup for all 14 seeded accounts (one customer, twelve providers, one administrator). The original 43-test backend suite and React production build passed. A password-change session-revocation issue was reproduced and fixed; the updated backend suite passes all 46 tests. The three new tests cover old/legacy session revocation, rejected password changes and concurrent password changes. These checks used temporary MongoDB 7.0.24 with Node.js 24.19.0.

No new browser visual checks, Windows checks, live OTP delivery, social login, online payment or deployment were performed in this update. The browser results below are historical. See [RENOVATION-PLAN.md](RENOVATION-PLAN.md) for the exact current scope, remaining features and implementation sequence.

## Earlier verification history

Latest approval/registration checks on 22 October 2026; earlier page redesign checks on 4 October 2026 with Node.js 24.19.0, npm 11.9.0 and temporary MongoDB 7.0.24.

## Results

| Check                                             | Result                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Backend integration suite                         | 43 tests passed; 0 failed                                                                                    |
| React production build                            | Passed                                                                                                       |
| Importable Postman collection, run with Newman    | 19 requests; 25 assertions passed; 0 failures                                                                |
| Full browser booking journey                      | Passed: customer request, provider acceptance, travel, OTP, completion, customer review and admin visibility |
| Guided finder and two-provider comparison         | Passed in browser                                                                                            |
| Public routes and every desktop dashboard section | No uncaught JavaScript errors or page overflow detected                                                      |
| Mobile public pages at 390 × 844                  | Home, services, finder, about, contact, login and registration checked                                       |
| Mobile role dashboards at 390 × 844               | Customer bookings, provider jobs and admin bookings checked without page overflow                            |

The backend suite checks account isolation, role permissions, password hashing, private uploads, provider approval, category visibility, suspended sessions, date/slot validation, duplicate-slot prevention, allowed status transitions, wrong/right OTP handling, saved reviews and contact enquiries.

## Page-by-page frontend updates

The Home and Services updates passed a fresh production build and focused browser checks. Home checks cover all categories, city synchronization, search links, FAQs and image loading. Services checks cover filters, chips, category guides, sorting, multi-word search, pagination, unknown filters, comparison/profile links and mobile filter controls. Both pages were checked for horizontal overflow at widths of 320, 390, 768, 1024 and 1440 pixels; no uncaught JavaScript errors were detected. See `HOME-PAGE-UPDATE.md` and `SERVICES-PAGE-UPDATE.md` for review instructions.

These frontend updates leave the backend unchanged. The backend, Newman and full-booking results above refer to the earlier complete-project verification.

The Provider Profile update passed a fresh production build and focused browser checks for actual profile/review data, review sorting/filtering, work-photo navigation and keyboard focus, sharing/comparison/favourites, live times, customer-login handoff, submitted booking, stale-slot recheck, malformed dates, unavailable/paused/empty/error states and account roles. Profile layouts were checked from 320 to 1440 pixels. The full booking journey and Postman collection were also rerun after the appointment and login-redirect changes; both passed. The backend implementation is unchanged.

## Provider approval correction — 22 October 2026

The 43-test backend suite passed after the fix. Added coverage includes required registration documents, invalid/oversized uploads, duplicate-account document cleanup, private owner/admin access, real document ownership at approval, rejected-profile resubmission, existing pending-account recovery, document replacement, concurrent removal and concurrent approval/removal.

Browser checks passed for all twelve seeded provider credentials and their documents, provider registration with a PDF, administrator document download/approval, automatic provider status refresh, rejection/resubmission and recovery of an existing account without documents. Registration and admin/provider document layouts were checked from 320 to 1440 pixels without horizontal overflow. The service finder returned actual matches with its new All listed cities default. No uncaught JavaScript errors were detected in these checks.

The complete customer → provider → OTP → completion → review → administrator browser journey passed again. The Postman collection passed all 19 requests and 25 assertions. The production build passed. See `APPROVAL-FIX-UPDATE.md` for installation and `../DEMO-ACCOUNTS.md` for the faculty walkthrough.

## Verification evidence

This archive includes the written results and reproducible backend tests. Browser captures were used for internal layout inspection. Demonstration accounts and service photographs are fictional; test bookings belong to stopped temporary databases.

## What still needs your setup

- Your personal Atlas cluster, database credentials and IP access entry are not configured here. Follow `START-HERE.md` to retain your records.
- Verification ran on Linux with Chromium. Windows setup and other browsers have not been directly tested.
- The project is not publicly deployed. Online payments, SMS OTP and outbound emails are not connected; the visit OTP appears inside the customer's dashboard.
- Demo data resets when `npm run demo` stops. Use `npm run dev` with Atlas for persistent records.

Use `npm test` and `npm run build` to reproduce the included backend/build checks. Import `docs/GharSeva.postman_collection.json` to demonstrate the API.
