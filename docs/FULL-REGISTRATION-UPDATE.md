# Registration requirements — implementation update

Updated 23 October 2026. This replaces the earlier page-only customer registration milestone.

## Implemented from the original registration request

| Requirement | Current implementation |
| --- | --- |
| Better customer/provider registration design | Matching responsive registration pages, clear customer/professional handoff and a four-step professional application |
| Password suggestions | Native `new-password` autocomplete, password rules and visibility; suggestions depend on the browser/password manager |
| Individual professionals | A professional applies as an individual; no company onboarding is exposed |
| Several service categories | Up to eight categories, with the first as the main service; discovery, finder, profile, editing and booking support the selected categories |
| Pending requests page for admin | Dashboard → Registration requests; searchable paginated queue with pending, incomplete, inactive, correction, approved and rejected filters |
| Half-completed forms | Optional saved drafts after contact proof; partial details/progress restore using the same primary contact. No provider account/public listing is created by a partial form |
| Staff contacting unfinished applicants | Separate optional follow-up permission; otherwise the verified contact is masked in the draft queue. Staff record follow-up notes; the app does not automatically contact applicants |
| Email/mobile verification | Five-minute single-use codes, attempts/cooldown limits, HttpOnly registration proof, verified-contact binding and expiry |
| Email/SMS code sign-in | Existing accounts first verify their saved contact in Account settings; admin OTP entry is excluded |
| Google and Apple | Firebase popup adapter and server ID-token verification, local identity linking, disabled setup states and explicit Apple relay association consent |
| Administrator review | Private document links, required notes, correction/rejection/approval, stale-review protection and applicant-visible history |
| Setup without service accounts | Explicit classroom-only test delivery plus a complete live-integration setup guide |

The user table keeps its existing required email, mobile and password schema. Each new account proves at least one contact. A Google/Apple registrant completes the remaining details and a GharSeva password on first onboarding. The original email/mobile password login, role permissions, provider document approval, sessions, booking lifecycle and existing records remain compatible. In production, registration requires verified proof. The old development API contract remains available for regression compatibility unless `REQUIRE_VERIFIED_REGISTRATION=true`; the new registration UI always requires proof.

New optional user verification/consent fields and separate challenge, throttle, registration-session, external-identity and provider-application collections are additive. No collection reset, destructive migration or default approval is used. Existing provider requests remain visible through the earlier-request link in the new queue.

## Verification

The full backend suite passes **65 tests**, including the previous 50 tests and 15 new registration-workflow tests. The new coverage includes expiry/attempts/reuse, concurrent resend throttling, proof binding, no-verification bypass, opted-in draft storage, ownership, password exclusion, masked/unmasked follow-up contacts, revision conflicts, inactive/expired drafts, conversion to a pending provider, private-document approval prerequisites, correction history, secondary-category booking and cross-category double-booking protection. Demo authentication is refused in production. The React production build passes.

Browser visual checks used isolated API fixtures because the supervised preview cannot run MongoDB. The actual React customer verification/detail views, professional entry/service-step views and administrator application queue were checked at widths 320, 390, 768, 1024 and 1440 pixels. Account registration, verification, permissions and booking behaviour were checked separately against the actual Express API and temporary MongoDB. No completed browser credential/code signup-to-dashboard journey, live Google/Apple flow, actual email/SMS delivery, Windows or non-Chromium check is claimed. Temporary preview fixtures are excluded from the project ZIP.

See [REGISTRATION-INTEGRATION-SETUP.md](REGISTRATION-INTEGRATION-SETUP.md) for classroom walkthroughs and exact live configuration. The implementation includes live adapters, but credentials and end-to-end live verification remain the project owner's setup step. No secrets are included in this archive.

## Scope boundaries

A saved inactive application is flagged for assistance; inactivity does not prove a login problem. Rule-based completeness checks explain missing details and never pretend to authenticate Aadhaar or compare document names using OCR. Final review is manual. Real Aadhaar, AI assistance, admin account invitation/creation, online payments and hosting remain separate project features.
