# Faculty Demo Showcase — local implementation, 29 October 2026

The owner reports that 20 imported fictional providers exist, ten categories are enabled, and an admin and one provider have completed real Brevo OTP login. This implementation did not connect to Atlas, change settings/users, send email, run payments, import providers or deploy. Activation remains an owner action after review/deployment.

## Separation from real approvals

The showcase is a platform setting, OFF by default. It never sets provider status to APPROVED, changes identityRequired, or creates identity evidence. Enabling/disabling changes only the Settings document's facultyDemoEnabled, facultyDemoRevision, bounded facultyDemoAudit and normal updatedAt metadata. Audit entries contain only actor ID, time, enabled state and revision; the last 50 are retained.

Only the twenty server-defined Ahmedabad imports qualify: their deterministic MongoDB ID (derived using the current database name), owner-demo account marker AND profile demo ID must all match the existing importer definitions. They must be ACTIVE, PENDING, identityRequired=true, have no documents, and have the expected category and normalized Ahmedabad account/profile city. Duplicate markers, missing accounts and mismatches prevent activation. Emails/domains are not authorization. No customer-supplied account list is accepted.

Normal discovery excludes these imports, including a mistakenly approved import. Opted-in showcase discovery revalidates eligibility and respects enabled categories, available profiles, city and category filters. Only public profile fields/images are projected. It returns `facultyDemo`, `facultyDemoLabel` and `bookingAllowed:false`, never login emails, mobile numbers, hashes, documents or credentials. Ratings/review/job counts are suppressed and the UI displays no stars, experience or verified-work claims for showcase cards. The label is:

**DEMO PROFILE — Fictional, not identity verified**

Ordinary approved real providers remain discoverable. Real pending providers remain hidden. The existing provider application and identity-review workflow is unchanged. Do not submit fictional identity evidence or attempt ordinary approval to enable this feature.

## Exact changed files for this task

| Files | Change |
| --- | --- |
| server/src/faculty-showcase.js (new) | Exact-account manifest, read-only preview, admin activation/reversal, atomic revision guard, bounded audit, allowlisted public projection. |
| server/src/models.js | Adds showcase settings/revision/audit; no user approval field changed. |
| server/src/app.js | Mounts guarded admin routes, public capability flag, opt-in discovery/detail, explicit imported-account booking/status denial. |
| server/src/payments.js | Prevents order creation for imported showcase accounts, even if mistakenly approved. Existing reconciliation/receipts remain intact. |
| server/src/service-assistant.js; server/src/assistant-matching.js | Same opt-in discovery and labels, no claimed free slots, no selecting/drafting a showcase booking. |
| client/src/context.jsx | In-memory customer opt-in, request invalidation on changes, public capability flag; no credentials stored. |
| client/src/components/FacultyDemoToggle.jsx (new) | Shared explicit Services/assistant opt-in. |
| client/src/components/UI.jsx | Display-only cards: fictional label, illustrative rate, no approval shield/rating/history, no favourite/comparison action for demos. |
| client/src/pages/Services.jsx | Toggle and accurate demo-introduction text; keeps city/category filters. |
| client/src/pages/ProviderDetails.jsx | Explicit demo detail view without appointment/payment controls or reviews. |
| client/src/pages/ServiceAssistant.jsx | Propagates opt-in, invalidates old responses/selections, labels demos and disables their selection. |
| client/src/pages/FacultyShowcaseAdmin.jsx (new); client/src/pages/Dashboard.jsx | Admin dashboard section with read-only preview, typed confirmation and guarded apply; busy/duplicate-submit protection. |
| server/test/faculty-showcase-unit.test.js (new); server/test/city-demo.test.js | Manifest and route regression coverage using mocked/in-memory models. Existing helper supports Mongo-style audit $each/$slice. |
| FACULTY-DEMO-SHOWCASE.md (new); OWNER-DEMO-PROVIDERS-HANDOFF.md | Review/deployment/activation instructions and pointer from the earlier importer evidence. |

Some touched files already had uncommitted social/assistant/catalog changes. Those were retained; this task's changes are described above. The importer, credential TXT/journal, real admin/customer/provider records and existing private configuration were not altered.

## Safe dry run and guarded apply — owner workflow

There is deliberately no database-edit CLI, seed or approval bypass. Use the admin dashboard so normal HttpOnly sessions, origin/CSRF/session-context protection and recent admin password/email-OTP proof apply.

1. Review and deploy a coherent version containing the files/dependencies below. Sign in as the existing admin with real email OTP.
2. Open `/dashboard/admin?section=faculty-showcase` and select **Enable faculty showcase**.
3. Click **Read-only preview**. This calls `GET /api/admin/faculty-showcase?enabled=1` and does not write. Expect 20/20 exact accounts, no issues, ten category counts of two when enabled/available. Missing or ambiguous profiles require investigation, not automatic approval or account replacement.
4. Only after reviewing the preview, type **ENABLE FACULTY DEMO SHOWCASE** and click **Apply showcase visibility only**. Complete the existing recent-admin reauthentication prompt if required. No user account is approved or edited.
5. Reversal: select **Disable faculty showcase**, preview again, type **DISABLE FACULTY DEMO SHOWCASE**, then apply. Disabling remains possible even if a profile has since become invalid. Refresh customer views to confirm it disappears.

The mutating endpoint is `POST /api/admin/faculty-showcase`; it accepts only the desired boolean enabled state, preview revision, preview fingerprint and exact confirmation. The fingerprint is required for enabling. Requests require a valid administrator session, correct session context and recent administrator proof. An authenticated customer/provider cannot activate it. A stale revision or changed manifest requires a fresh preview. Repeating the already-applied operation is a no-op, without duplicate audit entries. Concurrent changes are guarded by the Settings revision. Preview and public reads do not upsert showcase settings; missing main settings must be reviewed before a change can apply.

The admin route checks the complete twenty-account manifest at apply. Public requests revalidate eligible accounts again; later suspension, identity/marker changes, unavailable profiles and disabled categories cannot make an invalid profile bookable or expose unrelated accounts.

## Customer/faculty walkthrough after activation

1. In a separate customer/guest browser profile choose Ahmedabad (the existing saved city is reused for signed-in customers).
2. Open Services. Leave **Show Faculty Demo Providers** unchecked first: only approved real providers should appear. An existing real pending application remains hidden.
3. Check the option. With the reported eligible data, expect **20 demo cards**, two per enabled category, plus any eligible approved real providers. Page size is nine, so use pagination or a category filter. Rates are labelled illustrative.
4. Change category; expect two matching fictional profiles. Change city to Pune/another supported city; Ahmedabad demo profiles must not follow that filter. Ahemdabad is normalized to Ahmedabad. No city is silently widened or saved for unrelated users.
5. Open a demo detail page. Confirm the full fictional/not-identity-verified label, existing illustrations and no booking/payment controls. The detail request requires explicit `facultyDemo=1` and enabled admin authorization; normal detail requests remain unavailable for pending imports.
6. In the service assistant explicitly opt in, describe a supported job (for example, tap leaking), select service/city/date if needed, and inspect the labelled demo choices. Their booking selection is disabled. The assistant exposes no free demo appointment slots and cannot draft or confirm them. It continues to offer ordinary eligible real providers under normal rules.
7. Uncheck the option or disable the admin setting, then refresh. Demo cards disappear; ordinary approved providers remain.

Helpful read-only public checks, after activation, without exposing credentials:

```text
GET /api/config
GET /api/providers?city=Ahmedabad
GET /api/providers?city=Ahmedabad&facultyDemo=1
GET /api/providers?city=Ahmedabad&category=plumbing&facultyDemo=1
GET /api/providers?city=Pune&facultyDemo=1
```

Expected config flag: facultyDemoAvailable=true after admin activation. This is a capability/state flag, not proof of live visual checks. If categories are disabled or a provider becomes unavailable/invalid, fewer than twenty may be returned; no records are invented or automatically re-enabled.

## Booking/payment boundary

Showcase authorization is display-only. It cannot substitute for real approval. Ordinary booking creation, assistant drafts, provider booking-status changes and payment order creation explicitly refuse the imported accounts; their pending state is also preserved. Existing real booking ownership, acceptance, deposit, visit OTP, final bill approval and balance rules remain unchanged. Existing captured-payment reconciliation is retained, not erased or relabelled.

For a fictional customer→provider booking demonstration use a separate isolated classroom database:

```powershell
cd C:\workspace\GharSeva-MERN
npm.cmd run test:db
npm.cmd run demo
```

Only launch after the isolated database diagnostic passes in the owner's normal terminal. The existing launcher uses a fresh local database and a private ignored `.test-tmp\demo-accounts.local.md` guide; its displayed classroom OTPs and demo payments are **simulated**, not Brevo/Razorpay verification. It was not launched in this task. An actual Razorpay TEST demonstration needs separately prepared isolated/staging data, TEST credentials/capture settings and webhook evidence; do not use these production pending showcase accounts to bypass the payment/identity gates. See RAZORPAY-TEST-HOSTED-CHECKLIST.md and CORE-FUNCTIONALITY-HANDOFF.md.

## Deployment and verification evidence

No new environment variables, paid services, migrations or identity permissions are required. Do not enable production classroom authentication. Keep Brevo, database URI, JWT/storage secrets, Google/Apple and Razorpay settings unchanged, including:

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

Review tracked and untracked changes together and exclude all private files. This feature reuses the pre-existing `server/src/owner-demo-providers.js`, shared demo-email/image/city helpers, seed-data definitions/assets and existing session/assistant work; include their reviewed dependencies in the eventual deployment. Do not deploy just a single new UI file or discard unrelated changes. Rebuild frontend and deploy both client/server, then confirm Render's intended commit is Live before the admin preview/activation. No commit, push or deployment occurred here.

| Evidence | Status |
| --- | --- |
| Manifest and real route/auth/domain logic over in-memory models | Passed; includes 20-account matching, all categories/cities, labels, no leaks, admin denial/recent proof, idempotent enable/disable/audit, booking/payment refusal and preserved users. |
| Focused auth/Brevo/session/assistant/payment/import preservation tests | 183 passed, zero failed/skipped in the command below. Outbound providers and persistence were mocked. |
| Production build | Passed; Vite reports a non-fatal bundle-size warning (main chunk over 600 kB). No dependency change. |
| Connected MongoDB / full DB suite | Not run here; prior isolated loopback connect EACCES remains an environment blocker, not a passed integration check. No hosted database was substituted. |
| Browser/mobile layout | Not exercised; a passing build is not browser evidence. |
| Hosted showcase activation/visibility | Not performed; awaits reviewed deployment and owner activation. |
| Hosted OTP/payment | Owner reports existing Brevo login success; this task sent no email. Actual Razorpay Checkout/webhooks remain separate external checks. |

Exact executed focused command:

```powershell
node --test server/test/faculty-showcase-unit.test.js server/test/city-demo.test.js server/test/payment-stages-unit.test.js server/test/payment-gateway-unit.test.js server/test/password-login-unit.test.js server/test/session-security-unit.test.js server/test/brevo-email-unit.test.js server/test/assistant-conversation-unit.test.js server/test/assistant-client-unit.test.js server/test/owner-demo-providers-unit.test.js
npm.cmd run build
git diff --check
```

The initial showcase/city subset passed 26 tests. The broader final command passed 183. Neither is a connected Atlas/browser test. No approval, account, credential, booking or payment was modified outside temporary test fixtures. Next owner step: review this local change and its dependencies before arranging deployment; do not bulk-import the already-existing providers again.
