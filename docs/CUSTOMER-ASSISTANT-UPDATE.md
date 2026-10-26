# Conversational customer assistant — 25 October 2026

Implemented directly in the existing project. This document supersedes the earlier assistant milestone notes. No database was reset, seeded, migrated or replaced for this change. The existing authentication, OTP styles, professional images, approval rules and payment workflow remain in place.

## Customer flow

Open `/assistant` (also `/finder`). Start with a short task such as **Tap leaking**, **AC not cooling**, **Need someone to clean kitchen**, **Fan making noise** or **Washing machine not draining**.

- Clear services move straight to the missing city and date. Ambiguous descriptions ask one focused question; “Water on the floor” offers tap/pipe, AC/appliance and source-unknown replies. Enabled catalog services only. Recognised unavailable trades and common unsupported requests are explained rather than substituted.
- Public structured preferences retain problem, category, city/area, optional budget, date/time, chosen professional and sorting. “Actually tomorrow”, “Change the city”, “Change date”, “Under 500” and “Show cheaper options” update preferences and clear affected appointments. Change problem starts a new task while keeping useful location preferences. Changing the trade clears stale problem notes.
- Up to three actual active, approved professionals are matched against offered categories, the requested city/optional exact listed area, budget, working days, future IST slots and active bookings. Paused platform bookings produce no bookable appointments. Default order is rating, review count, starting estimate and name; cheaper options orders by estimate. A still-eligible explicit choice survives a change in ranking. No distance or technical diagnosis is invented.
- Cards use the shared work-photo resolver: real uploads precede samples, sample labels remain visible and missing images use the neutral placeholder. Cards show starting visit estimates, review information, exact checked date/times and factual match reasons.
- Professional/time selection stays in the conversation. Customer authentication is required before private address access or draft creation. Saved addresses are loaded using `/auth/me` and used only after an explicit choice. A new address can also be entered. Problem notes are prefilled and editable. Private address/notes stay in page memory through normal date/time changes for the same customer and service area; changed areas require a new address choice.
- Review shows professional/service, IST appointment, requested area, address, notes, current starting estimate and extra-work/material limitations. **Confirm & request booking** is the only UI action that sends a PENDING request. The professional still must accept. No payment is started; the existing visit-start OTP is unchanged.

Public selection through login uses tab-scoped session storage with a 20-minute logical expiry. Only category, city/area, budget, date/time, sort and provider ID are retained. The URL is simply `/assistant`. Conversation text, private address and notes are deliberately excluded; add problem notes again after login if necessary. All restored selections are revalidated on the server. Page reloads and leaving the page clear the in-memory conversation.

## Server boundaries

`POST /api/assistant/conversation` accepts only allowlisted discovery preferences and events. Those values carry no customer identity, price authority or booking permission. Every proposed category and chosen professional is checked against the enabled catalog and current public provider records. Text cannot supply executable tools or override account roles.

The existing `/assistant/analyse` and `/assistant/matches` APIs remain compatible; matching now includes live schedule/booking checks. For legacy matching requests without a date, the response explicitly identifies tomorrow's checked date in `availability.date` and match reasons. The conversational UI asks for a date before displaying matches.

The existing authenticated draft/confirmation routes and `createCustomerBooking` are reused:

- Draft customer comes exclusively from the authenticated session. Price comes from the database; a changed displayed card estimate is rejected before draft preparation.
- Drafts are customer-owned and expire after 20 minutes, even before MongoDB TTL cleanup. Preparing one does not reserve a slot. Editing or changing selection attempts to discard the old draft.
- Confirmation requires `confirm: true`, owner access and a current active customer session. It rechecks professional active/approved status, offered/enabled category, schedule, current price and platform controls.
- Existing unique active provider/date/time and unique assistant-draft indexes protect competing submissions and retries. The same draft returns its original booking rather than creating another. Ordinary bookings use the same creation function and slot index.
- Changed prices or occupied slots require refreshing the options and reviewing a new draft. No background retry silently changes a price or appointment.

Discovery limits are per server process/IP (30 turns/matches per 15 minutes). Configured external description analysis has a separate limit of 8 per 15 minutes; booking controls do not spend that AI allowance. Draft/confirmation limit remains 40 per 15 minutes. A multi-instance deployment would need a shared rate-limit store.

## Optional AI setup

Guided mode needs no AI account. It supports common English service words and a small set of spelling corrections; it does **not** claim model-quality Hindi/Gujarati or mixed-language understanding.

The existing server-side OpenAI Responses adapter is extended, not replaced. In `server/.env`, configure:

```dotenv
ASSISTANT_AI_ENABLED=true
OPENAI_API_KEY=<your server-side key>
OPENAI_MODEL=gpt-5.4-mini
```

Do not put this key in a client `VITE_` variable. Restart the API after configuration. A configured model must support the existing strict JSON-schema Responses request and be available to your API project. The existing `server/.env.example` already contains these settings. No new email, AI or social-auth provider was added.

The customer must opt in before external description analysis. The request contains only the current problem/clarification text and enabled service names/descriptions. The model receives no account/provider records, filters, saved addresses, private booking fields, documents or payment data. Once a service is chosen, conversational control messages bypass external analysis. Private address/note controls never enter it.

The adapter validates enabled category enums, expected fields/types, one-question limit and refusal/incomplete/invalid JSON responses. It rejects extra fields such as model-generated booking actions. Failed or invalid output falls back to honestly labelled guided matching. Basic contact/identifier and common English address-line redaction is defence in depth, not a guarantee of finding all personal information in arbitrary free text; keep private data out of problem chat. `store:false` does not promise zero provider retention.

Safety guidance covers recognised electrical/gas/structural hazards, including a hazard reported after initial service selection. It is not a comprehensive emergency detector. The model is instructed to recognise multilingual descriptions and avoid hazardous repair instructions or definite diagnoses. Live model language quality and safety performance remain unverified.

## Local startup and review

Use the existing persistent MongoDB configuration and existing secrets in `server/.env`. Keep `MONGODB_URI`, `JWT_SECRET` and any existing identity-storage key stable. No seed or data-update command is required.

```powershell
Set-Location 'C:\workspace\GharSeva-MERN'
npm run dev
```

The current running API was observed to have the older routes; it returns “API endpoint not found” for the new conversational endpoint. It must be restarted through its owning terminal to load this update. Do not launch a second API on an occupied port. The frontend explains the required restart and offers Retry.

**Do not stop a classroom memory demo expecting its data to persist.** `npm run demo` starts a temporary MongoDB and overrides authentication delivery to displayed classroom codes; stopping it loses that temporary process's data. This task did not stop or restart that existing process. For records that must survive restart, use the existing persistent MongoDB workflow (`npm run dev`), without seeding.

For existing password login in the persistent/live workflow, keep the previously documented SMTP setup: `AUTH_DELIVERY_MODE=live`, `GHARSEVA_DEMO=false`, accessible registered inbox and working SMTP credentials. See `LOGIN-TWO-STEP-SETUP.md`. The assistant does not change this requirement or simulate email delivery.

Review at http://localhost:5173/assistant:

1. Sign in as an existing customer using the existing password-plus-email-OTP flow, or start discovery signed out.
2. Send “Tap leaking”, choose a listed city and an available future date. Check the sample/upload caption, estimate, reviews and appointment times on the actual professional cards.
3. Try a smaller budget, another date, an exact listed area and “Show cheaper options”. Verify empty results without an automatic location change.
4. Choose a professional and time. Select a saved address explicitly or enter a real address in the offered service area. Edit notes if needed.
5. Review all details and limitations. Use Edit details, then review again. Only confirm a request you intend to create; the professional must still accept it.
6. Separately check “Water on the floor”, an unsupported service and a hazard description. At phone width, check cards, time buttons and the full booking summary.
7. If testing optional AI, opt in and use descriptions in English/Hindi/Gujarati/mixed language. This requires your configured API account; automated mock tests do not establish live language quality.

For production assets: `npm run build`. The existing production command is `npm start`; use the established deployment/environment setup rather than the classroom launcher.

## Checks actually performed

- `node --test server/test/assistant-conversation-unit.test.js server/test/password-login-unit.test.js server/test/work-images.test.js`: **42 passed, 0 failed** (19 assistant, 11 login, 12 work-image checks).
- The new assistant tests use real route handlers, JWT authorization, the existing public-provider projection, shared booking validation and schema/index definitions with mocked persistence. They cover short/typo descriptions, ambiguity, unsupported services, hazards/corrections, context changes, actual eligible provider filtering, free slots, selected-provider revalidation, AI consent/failure/invalid output, field allowlisting, draft privacy/expiry/deletion, customer-only access, explicit confirmation, changed status/approval/category/price/platform controls, occupied slots, concurrent/idempotent confirmation and ordinary booking compatibility. AI responses are mocked; no live model was contacted.
- `npm run build`: **passed**, 1,623 modules transformed. No dependency changes.
- `node --test --test-timeout=20000 server/test/service-assistant.test.js` (TEMP/TMP pointed at the project `.test-tmp`): **not passed**. The shared MongoDB setup timed out; all 13 integration tests consequently failed on that setup timeout. Socket access from the shell was also denied. This is not a successful real-MongoDB/HTTP regression run. Repeat `node --test server/test/service-assistant.test.js` in an unrestricted local terminal. The root `npm test` runs the build and full server suite when MongoDB/HTTP access is available.
- Browser: actual current UI checked on the existing Vite preview; the old API restart/error state was observed. An isolated browser fixture then exercised the actual React UI and pure guided/context/matching modules through short problem → city → date → professional → time → explicit saved-address choice → review → edit → confirm → PENDING receipt. Also checked no results, the ambiguity question and date correction clearing selection while keeping context.
- Browser measurements: desktop viewport 1280px had document scroll width 1265px; phone viewport 360px had document scroll width 345px. Mobile cards and summary were 283px wide; work images were 165px tall and both review buttons fitted. No horizontal overflow at these checked widths. Keyboard Tab was used for budget editing; native controls and screen-reader labels/log were inspected. This was not a full assistive-technology audit.
- UI fixtures were temporary, isolated and removed. They created no real bookings or provider records. A separate isolated fixture server could not be reached by the browser and was stopped. The user's existing server was left running.
- A pre-edit file hash inventory confirmed that login/OTP and shared work-image sources/assets stayed unchanged. The work-image suite's seed checks use mocked persistence; no real database was seeded.

Still unverified: a full real-MongoDB HTTP regression run, a live-database browser booking on the restarted API, the signed-out login/resume round trip in the browser, live OpenAI language quality/latency/billing, live email/social authentication, deployment and a full screen-reader audit.

## Files changed

| File | Purpose |
| --- | --- |
| `client/src/pages/ServiceAssistant.jsx` | Structured conversational discovery, inline controls/cards/address/review/receipt and public login handoff |
| `client/src/pages/ServiceAssistant.css` | Scoped responsive chat/card/summary styling and focus states |
| `client/src/pages/Public.jsx` | Assistant privacy notice reflects current description and public login selection handling |
| `server/src/assistant-conversation.js` | New allowlisted public discovery state, focused next steps and corrections |
| `server/src/assistant-matching.js` | New schedule/active-booking matching and factual reasons |
| `server/src/assistant-analysis.js` | Short/typo descriptions, ambiguity/unsupported handling and constrained multilingual AI instructions/validation |
| `server/src/service-assistant.js` | Conversation endpoint, availability-aware matching, shared adapter fallback and displayed-estimate checks |
| `server/src/app.js` | Exports existing public-provider/booking helpers for exercising the actual workflow in regression tests; ordinary booking logic unchanged |
| `server/test/assistant-conversation-unit.test.js` | New 19 focused regression tests with mocked AI/persistence |
| `server/test/service-assistant.test.js` | Clear service now expects no unnecessary follow-up questionnaire |
| `docs/CUSTOMER-ASSISTANT-UPDATE.md` | Current implementation, review steps, configuration and actual validation results |
