# Assistant booking verification — 27 October 2026

Milestone 5 is implemented locally in the existing working copy. Milestone 4 edits and earlier Brevo, catalog, images, city, account, approval, session and two-stage payment work are preserved. Nothing was pushed, deployed, seeded or migrated against shared data. No mail, contact message, AI request or payment was sent to a real provider.

## Confirmed gaps and changes

The previous guided matcher relied on English patterns; typed service changes could retain the old trade. Review omitted the numeric deposit, and refresh discarded the prepared request. Confirmation returned the broader booking view, including fields the assistant did not need. Optional AI previously relied on pattern redaction of raw text, which cannot reliably remove arbitrary addresses/names.

The existing assistant routes, shared public discovery and createCustomerBooking are reused. Curated English/Hindi/Gujarati/romanized service aliases select only enabled catalog services. Equipment names distinguish washing-machine/AC symptoms from plumbing. Ambiguity asks one question with actual available choices; disabled services, an empty catalog, no professionals, paused bookings and API failure remain distinct.

Typed service/city/date/area changes, alternatives, back and cancellation invalidate dependent choices. Late discovery responses use a generation check. A saved customer city is reused and normalized; changing discovery city never edits that account's saved city. Area is the existing exact listed service area, not a distance/radius search.

Private review shows the provider/service, IST appointment, area/address/notes, authoritative starting estimate and configured deposit. Confirmation rechecks the current enabled service, provider status/availability, city/schedule, price, service area and deposit plan through the same ordinary-booking creator. A changed quote or terms require another review. Required payment gates are unchanged.

No chat turn creates a booking. Authenticated customer draft confirmation requires confirm=true. The existing unique assistantDraft and active provider/date/time indexes protect same-draft retries and competing slots; they are not new startup migrations. Owner-scoped GET retrieves a prepared draft or its persisted booking. Confirmation/GET use an allowlisted receipt without visit codes, OTP attempts or provider documents. The normal booking domain retains its existing visit-verification lifecycle; the assistant has no separate OTP generator or payment tool.

Browser storage contains a public selection or an owner-bound, expiring draft ID/pending marker, never address/notes/conversation text. Public continuation excludes area and problem text and returns only to /assistant. Private details remain page memory and the existing owner-scoped server draft (20-minute logical expiry plus MongoDB TTL); the reference also expires within 20 minutes. A same-ID uncertain confirmation can be retried/recovered without preparing another request. After that reference expires, check My bookings before intentionally preparing a separate booking. If storage is disabled, in-memory booking remains usable but refresh recovery cannot be promised.

Optional AI receives only fixed canonical service keywords plus public catalog metadata; only an enabled candidate consistent with those keywords is accepted, and displayed guidance is supplied by the application rather than model prose. Raw customer messages, addresses, names, codes and payment data are never forwarded. It cannot create bookings or change roles. Guided matching works without any AI key. Curated safety phrases stop matching and give concise leave-the-hazard/contact-local-emergency-or-utility guidance, without invented numbers or repair instructions. This phrase detector is not an emergency diagnosis service.

## Changed files in this milestone

| File                                            | Purpose                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| server/src/assistant-aliases.js                 | Maintainable phrase normalization/aliases and fixed outgoing AI signals                                  |
| server/src/assistant-analysis.js                | Enabled catalog, multilingual matching, ambiguity/safety, constrained AI input                           |
| server/src/assistant-conversation.js            | Corrections, native date/city phrases, alternatives/back/cancel, sensitive-input boundary                |
| server/src/assistant-matching.js                | Canonical city/exact area and alternative-provider matching                                              |
| server/src/service-assistant.js                 | Honest states, reviewed deposit/area snapshots, owned draft recovery, minimal receipts                   |
| server/src/app.js                               | Shared creator rejects changed reviewed area/deposit terms                                               |
| server/src/models.js                            | Draft payment-plan and area snapshots; no index migration                                                |
| shared/assistant-client-state.js                | Minimal expiring storage helpers and stale-response gate                                                 |
| client/src/pages/ServiceAssistant.jsx           | Recovery/retry/cancel, reviewed terms, private-state clearing and clear busy/errors                      |
| client/src/context.jsx                          | Preserve minimal guest continuation through login/city restoration; clear assistant references on logout |
| client/src/pages/ServiceAssistant.css           | Scoped composer/safe-area/narrow-screen adjustments                                                      |
| server/test/assistant-conversation-unit.test.js | Actual domain/handler regressions with mocked persistence/AI boundary                                    |
| server/test/service-assistant.test.js           | Additional real MongoDB/HTTP recovery and stale-area assertions, currently blocked by the environment    |
| server/test/assistant-client-unit.test.js       | Storage isolation/expiry and response-generation checks                                                  |
| docs/CUSTOMER-ASSISTANT-UPDATE.md               | Historic evidence retained; points to this current handoff                                               |
| ASSISTANT-BOOKING-VERIFICATION.md               | Current implementation, evidence and operator walkthrough                                                |

Other existing local changes belong to milestone 4; they are not removed or represented as newly implemented here.

## Validation checkpoint

- Initial relevant existing domain tests: 76 passed.
- Final expanded assistant/client/city/payment focused checks: **96 passed, zero failed/skipped**.
- Preservation command below: **232 passed, zero failed/skipped**.
- Production build: **passed** (Vite compiled 1,636 modules).
- git diff --check: **passed (exit 0)**.
- npm.cmd run test:db exited 1: isolated MongoDB child started, then **Isolated MongoDB connection failed (connect EACCES: loopback denied by environment). No saved database was used.**
- Connected MongoDB/HTTP and full-suite checks remain blocked before assertions. The earlier reported 181 failures are historical, not a new successful run.
- A fresh bounded Node local-listener/self-connect probe also failed with EACCES (no external host/database); it confirms local connection denial independently of MongoDB. No Playwright/Puppeteer/jsdom/test-renderer package is installed in the existing workspace. The previous local browser attempt timed out with net::ERR_CONNECTION_TIMED_OUT and was not repeatedly launched against the same blocked loopback. No full browser, narrow-viewport or hosted behavior is claimed. Browser-flow review also requires a connected isolated dataset.

## Supported examples

These are curated matching examples exercised by automated tests, not full language translation or unrestricted language understanding. Assistant prompts are primarily English.

| Description                                                | Enabled canonical service    |
| ---------------------------------------------------------- | ---------------------------- |
| Tap leaking / nal tapke                                    | plumbing                     |
| नल टपक रहा है / નળ લીક થાય છે                              | plumbing                     |
| AC not cooling / एसी ठंडा नहीं करता / એસી ઠંડુ નથી કરતું   | appliance                    |
| Fan making noise / पंखा आवाज करता है / પંખો અવાજ કરે છે    | electrical                   |
| Washing machine not draining / વોશિંગ મશીન પાણી નથી કાઢતું | appliance                    |
| घर की सफाई / ઘર સફાઈ / safai chahiye                       | cleaning                     |
| खाना बनाना / રસોઈ કામ                                      | cooking                      |
| suthar joiye / लकड़ी मरम्मत                                | carpentry                    |
| दीवार पेंट / દીવાલ પેઇન્ટ                                  | painting                     |
| બગીચા કામ / सामान उठाना / ટાઇલ્સ કામ                       | gardening / labour / masonry |

The executable fixture matrix is authoritative for the exact spellings. New phrases require alias/test additions. Tomorrow/today and curated आज/aaj/આજે, कल/kal/કાલે/આવતીકાલે are supported; relative native “kal” is interpreted as tomorrow in this future-appointment flow. ISO dates and listed slots remain the reliable date/time controls. Ahmedabad native spellings and Ahemdabad normalize to the existing supported city; other cities use existing canonical choices.

Example conversation: “Tap leaking” → saved city reused → “Tomorrow” → choose an actual provider → choose a listed slot → sign in if needed → enter private address → review deposit/estimate → **Confirm booking** → persisted reference/PENDING status.

Hindi/Gujarati example: “नल टपक रहा है” or “નળ લીક થાય છે” → “कल” / “કાલે” → same provider/time/address/review steps. These examples work only when plumbing is actually enabled and an eligible provider has a free appointment.

Corrections: “Actually AC not cooling” changes trade and clears provider/time; “Change the city” clears area/provider/time; “area Satellite” applies the exact listed area; “alternatives” excludes the previous chosen professional; “go back” clears the current appointment step; “cancel draft” discards an unconfirmed prepared draft only after server acknowledgement. It cannot cancel a created booking.

Ambiguity: “Water on the floor” asks one source question. AC is not suggested if its service is unavailable. No matches offers change date/city/clear filters, never silently widens the search. “Gas smell” or tested native equivalents stop routine booking. Password/code/payment-number messages are rejected; they are not rendered as a chat echo or passed to AI.

## Commands actually run

Logs are ignored local diagnostics under .test-tmp; they contain fixture results, not provider secrets or live codes.

```powershell
# Domain/handler/recovery/city/payment focused checks (96 passed)
node --test server/test/assistant-conversation-unit.test.js server/test/assistant-client-unit.test.js server/test/city-demo.test.js server/test/payment-stages-unit.test.js
# Preservation (232 passed; mocked repositories/providers and pure logic, no connected MongoDB)
node --test server/test/assistant-client-unit.test.js server/test/assistant-conversation-unit.test.js server/test/brevo-email-unit.test.js server/test/catalog-reconciliation-unit.test.js server/test/checkout-unit.test.js server/test/city-demo.test.js server/test/email-delivery-unit.test.js server/test/external-auth-unit.test.js server/test/firebase-social-unit.test.js server/test/isolated-mongo-unit.test.js server/test/password-login-unit.test.js server/test/payment-gateway-unit.test.js server/test/payment-migration-unit.test.js server/test/payment-stages-unit.test.js server/test/session-security-unit.test.js server/test/work-images.test.js
npm.cmd run build
npm.cmd run test:db
node .test-tmp/assistant-loopback-probe.mjs
git diff --check
```

The two readiness probes failed (nonzero); they were not counted as passed tests. The connected assistant suite includes two additional real database recovery/stale-area tests, but they were not run because the isolated database readiness check failed. No full-suite success is claimed.

## Isolated operator verification

Run in an operator environment that permits local loopback connections, using this project's disposable MongoDB fixture. Never replace the fixture with a hosted MongoDB URI.

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run test:db
node --test server/test/service-assistant.test.js server/test/api.test.js server/test/payments.test.js server/test/login.test.js
npm.cmd test
```

The connected tests use their own isolated database and test delivery/gateway fixtures. No production auth bypass is enabled. Existing CATALOG-AHMEDABAD-REPAIR.md describes guarded isolated demo setup and the ignored local account guide. Use that workflow only on a deliberately isolated demo database, never shared Render data. Preserve NODE_ENV=production, AUTH_DELIVERY_MODE=live, GHARSEVA_DEMO=false and the existing Render startup command for production.

Faculty walkthrough (manual, not claimed completed):

1. Start the existing API/client using npm.cmd run dev with the isolated demo database. Use separate browser profiles for customer, assigned professional and admin; do not defeat cross-tab session protections. Test fixture addresses cannot receive live email OTP.
2. Sign in through the existing isolated test facilities/mocked delivery only in the test environment. A hosted/password-login demonstration needs an operator-controlled stored inbox with independently verified delivery.
3. Check the customer's saved city, type a short tested phrase, choose tomorrow, compare actual public cards and select one slot.
4. Enter a fictional service address in the private form. Review provider/service/date/area/estimate/deposit, then Confirm booking once. Record only reference/status, not codes or credentials.
5. Refresh. Verify persisted booking/status or recovery of the same uncertain draft. Repeat confirmation for the same request: one booking only. Intentionally create another request only through a new draft with another eligible appointment.
6. In the assigned professional profile, find and accept that request; a different professional must be denied. Customer refresh shows ACCEPTED; admin may view under its existing role.
7. Required confirmed deposit and existing visit-start verification precede work. Complete work and follow approved final-bill/extras rules, then the separate approved remaining balance. The conversation never launches checkout, approves bills or marks paid.
8. If checkout is disabled, show its unavailable state and preserved work/payment gates. Use explicit mocked TEST gateway fixtures for automated state transitions; actual Razorpay TEST Checkout/capture/webhooks remain separate unverified steps.
9. Exercise changed service/city/date/address, back, alternatives, cancellation, price/area/deposit change, provider suspension and occupied slot. Retain safe entered address/notes for a same-area correction, then review again. Verify logout/account switch removes private assistant state.
10. Check keyboard focus, live status, cancellation/retry and narrow-screen keyboard behavior in a real browser. These checks are pending here.

## Evidence boundaries and remaining work

| Layer                                                                          | Status                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Guided/domain/handler tests with mocked repositories and provider boundaries   | 232 preservation tests passed, including 96 focused assistant/client/city/payment tests |
| Client storage/response-gate unit tests                                        | Passed as pure logic; not a rendered UI test                                            |
| Connected isolated MongoDB/HTTP and database concurrency                       | Blocked by connect EACCES; not passed                                                   |
| Complete browser customer → assistant → provider-request flow                  | Unverified; local browser transport previously timed out and isolated DB blocked        |
| Real optional AI                                                               | Not called; not required                                                                |
| Hosted discovery/catalog/bookings                                              | Not modified or verified                                                                |
| Email inbox, Google/Apple OAuth, Razorpay TEST Checkout and delivered webhooks | Still unverified external integration work                                              |
| Live-money collection/refunds/payouts                                          | Not performed                                                                           |

Limitations: exact listed service-area matching (no invented geocoding/radius); curated aliases/safety phrases rather than a complete language model; 20-minute reference recovery; per-process existing rate limits rather than a multi-instance store. In-process persistence fixtures implement declared uniqueness for decision testing and cannot prove MongoDB atomic/index behavior. Existing connected tests remain enabled with their real assertions.

Pending after this milestone: operator inbox delivery/Apple relay verification, real Google/Apple configuration/sign-in, hosted catalog reconciliation/approved Ahmedabad demo data, real Razorpay TEST capture/Checkout/webhook validation, deployment confirmation, dependency audit and remaining approved audit work. This is not a claim that the complete website is fixed.
