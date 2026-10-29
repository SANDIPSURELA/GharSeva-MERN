# Faculty Showcase deployment review — 29 October 2026

Repository: C:\workspace\GharSeva-MERN. Local HEAD: `26987f4d93a6c19844f68c40ff6e4c76fbd0d8e8`.

**Review result:** the current client/server runtime is internally complete and passed the checks below. A pure showcase-only commit is **not prepared as an independent whole-file snapshot**: showcase, social authentication and assistant changes share files. The recommended manifest deliberately releases the tested integrated runtime, without running or shipping the standalone account-correction/import entry points. This is not a claim of hosted/end-to-end verification.

At inspection: **35 modified tracked files, 31 untracked files, zero staged files**. All 66 files were read for imports/content/security review. This review adds one document only; no existing source/configuration was edited. No staging, commit, push, deployment, MongoDB access/write, migration, import, email or payment occurred.

## Why these changes travel together

| Dependency | Consequence for the current snapshot |
| --- | --- |
| app.js → faculty-showcase.js → owner-demo-providers.js → shared/demo-email-aliases.js | The new imported-provider helper and alias module must be present even though the bulk import CLI need not be deployed. These modules define functions; importing them does not create accounts/send email. |
| app.js, payments.js, service-assistant.js → faculty-showcase.js; models.js → showcase settings | Server routes, normal-booking/payment guards and settings must ship together. |
| Dashboard.jsx → FacultyShowcaseAdmin.jsx; Services/ServiceAssistant → FacultyDemoToggle.jsx; context.jsx supplies their state | The client and server must be deployed as a coordinated build, not a UI-only patch. |
| context.jsx → clearExternalIdentity in shared/external-auth.js | The working context needs an export absent from HEAD. Taking the whole context file without its social-auth helper is unsafe. |
| identity-services.js → firebase-identity.js and social-readiness.js; deployment.js → social-readiness.js | The current server identity/validation modules cannot be deployed while omitting these new files. |
| ContactVerification/Applications → client/external-identity.js → shared/external-auth.js; registration/models implement provider bindings | The recommended integrated runtime includes the compatible social UI/backend changes, while keeping provider activation/configuration independent. |
| ServiceAssistant/context → shared/assistant-client-state.js; assistant-analysis/conversation/service-assistant → assistant-aliases.js | Whole-file staging of the current assistant needs these added modules and its changed CSS/domain code. |
| city-demo.test.js → demo-expansion.js | The selected regression suite expects the local classroom fixture cleanup (no fabricated documents/experience). Include that source change and its catalog handoff note for reproducible tests. It is not a production seed. |
| owner-demo-providers-unit.test.js → scripts/owner-demo-journal.js | This safe source utility is included as a test dependency. The real journal/TXT are never included and the importer entry point stays local. |

All changed runtime files reachable from the current server/client entry points are included below (30 files). Relative-import resolution was also checked against the proposed candidate: selected paths from the working copy, other tracked paths from HEAD. **No missing candidate relative imports were found**, including selected tests. Existing package manifests/lockfile, canonical definitions, city/image helpers, illustrations, auth/session modules and Brevo adapter are already tracked and unchanged; no dependency update is required.

Not every social/assistant edit is intrinsically required by the *concept* of a showcase. They are included to ship the actual tested runtime instead of an untested mixture of old and new modules. A strictly isolated showcase commit would require careful hunk extraction from app/models/context/service-assistant/assistant-matching and separate validation of that exact candidate. That extraction was not performed, and cannot be promised by blindly staging a shorter filename list. Do not reset/stash/discard work to obtain it.

## Classification of every pre-existing change

“Stage” means include in the recommended integrated release **after owner review**, not staged by this task. “Defer” means keep the working file untouched and uncommitted for a later separate operator-tool commit. These sources are not being classified as secret merely because they are deferred.

### A — Showcase and required shared/runtime dependencies (16)

All are Stage. app/models/context/ServiceAssistant/service-assistant/assistant-matching contain mixed feature changes.

```text
client/src/components/FacultyDemoToggle.jsx
client/src/components/UI.jsx
client/src/context.jsx
client/src/pages/Dashboard.jsx
client/src/pages/FacultyShowcaseAdmin.jsx
client/src/pages/ProviderDetails.jsx
client/src/pages/ServiceAssistant.jsx
client/src/pages/Services.jsx
server/src/app.js
server/src/assistant-matching.js
server/src/faculty-showcase.js
server/src/models.js
server/src/owner-demo-providers.js
server/src/payments.js
server/src/service-assistant.js
shared/demo-email-aliases.js
```

### B — Google/Apple authentication, readiness and templates (12)

All are Stage for the recommended tested integration snapshot. This does not activate Google/Apple or verify real OAuth.

```text
client/src/components/ContactVerification.jsx
client/src/external-identity.js
client/src/pages/Applications.jsx
scripts/check-integrations.js
server/.env.example
server/.env.production.example
server/src/deployment.js
server/src/firebase-identity.js
server/src/identity-services.js
server/src/registration.js
server/src/social-readiness.js
shared/external-auth.js
```

### C — Booking assistant additions (5)

All are Stage; other assistant files are listed under A because they also carry showcase behavior.

```text
client/src/pages/ServiceAssistant.css
server/src/assistant-aliases.js
server/src/assistant-analysis.js
server/src/assistant-conversation.js
shared/assistant-client-state.js
```

### D — Local operator tooling (6)

| File | Decision |
| --- | --- |
| scripts/admin-email-plan.js | Defer |
| scripts/correct-admin-email.js | Defer |
| scripts/import-owner-demo-providers.js | Defer; the 20 accounts already exist; no import is needed for showcase activation. |
| scripts/owner-demo-diagnostic.js | Defer |
| scripts/owner-demo-journal.js | Stage solely as selected unit-test dependency; contains code, not actual credentials. |
| server/src/admin-email-correction.js | Defer; no runtime imports it. |

### E — Tests/documentation (25 before this review)

| File | Decision |
| --- | --- |
| ADMIN-EMAIL-CORRECTION.md | Defer with operator tool |
| ASSISTANT-BOOKING-VERIFICATION.md | Stage |
| CORE-FUNCTIONALITY-HANDOFF.md | Defer; broader owner/local handoff |
| FACULTY-DEMO-SHOWCASE.md | Stage |
| GOOGLE-SIGNIN-LIVE-CHECKLIST.md | Stage |
| OWNER-DEMO-PROVIDERS-HANDOFF.md | Defer with import CLI |
| RAZORPAY-TEST-HOSTED-CHECKLIST.md | Stage as payment-boundary handoff |
| SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md | Stage |
| docs/CUSTOMER-ASSISTANT-UPDATE.md | Stage |
| docs/HOSTING-DEPLOYMENT.md | Stage |
| docs/LOGIN-TWO-STEP-SETUP.md | Stage |
| docs/REGISTRATION-INTEGRATION-SETUP.md | Stage |
| server/test/admin-email-correction-unit.test.js | Defer with operator tool |
| server/test/assistant-client-unit.test.js | Stage |
| server/test/assistant-conversation-unit.test.js | Stage |
| server/test/city-demo.test.js | Stage |
| server/test/demo-plus-alias-unit.test.js | Stage |
| server/test/deployment.test.js | Stage; connected portions not run here. |
| server/test/external-auth-unit.test.js | Stage |
| server/test/faculty-showcase-unit.test.js | Stage |
| server/test/firebase-social-unit.test.js | Stage |
| server/test/owner-demo-diagnostic-unit.test.js | Defer with diagnostic helper |
| server/test/owner-demo-providers-unit.test.js | Stage; needs journal source above. |
| server/test/password-login-unit.test.js | Stage |
| server/test/service-assistant.test.js | Stage; connected tests not run here. |

This new `SHOWCASE-DEPLOYMENT-REVIEW.md` is also Stage. Some released handoffs reference the owner's retained local CORE/OWNER handoffs; those are local operator references, not missing runtime dependencies. Keep those local documents and tools together for a later reviewed operator-tool commit.

### F — Other changes / unfinished verification

| File/status | Decision |
| --- | --- |
| server/src/demo-expansion.js | Stage as test-consistency dependency, not required by production runtime. Removes fabricated classroom PDFs and invented experience; retains non-production guards. Never execute it against Atlas. |
| CATALOG-AHMEDABAD-REPAIR.md | Stage the corresponding two-line historical-documentation correction. |
| Other unexplained source changes | None found among the 66 inspected paths. |
| Real Google/Apple, connected MongoDB, browser and gateway verification | Still incomplete/unverified; passing mocks do not resolve these. |

## Security/configuration review

- No current operational secret, private inbox literal or generated provider password was found in tracked/untracked repository files using exact comparisons with the private local configuration and the outside-repository provider TXT, plus key/URI/private-key pattern checks. Twenty provider password entries were scanned without displaying them. No raw values were emitted. This is a best-effort working-tree audit, not a forensic audit of every historical commit or unknown secret.
- The private provider TXT exists outside the repository. No active provider recovery journal was present at inspection. The private correction plan/archive remain outside the repository and were not copied, edited or deleted. No actual plan/journal/credential JSON/TXT appeared in the tracked/untracked path list.
- `server/.env` is ignored. Ignore rules also cover other private .env files, keys/PEM/service-account files, .test-tmp, client/dist and node_modules. Never use force-add to override those rules. Never stage the external GharSeva-private directory or screenshots containing credentials.
- Legacy published sample passwords exist in already tracked account tables, docs and isolated test fixtures and match local SEED_* settings. These are known classroom defaults, **not private credentials**. No current non-SEED operational password/secret or newly generated provider password matched repository text. Do not use sample defaults for real accounts; whether any unrelated historical account uses them was not checked in MongoDB. Removing strings from a new commit would not erase their existing history.
- URI-like strings in examples/tests are placeholders, loopback test URIs or deliberately hostile diagnostic fixtures, not the configured Atlas URI. Tests construct synthetic errors; they do not connect using that diagnostic fixture. The diagnostic fixture/source stays deferred with its helper.
- `.env.example` changes are documentation; `.env.production.example` adds blank Firebase configuration names. No existing production mode/key value was changed in those templates. **Do not copy templates over Render's working environment.**
- Startup, package manifests/lockfile and render.yaml are unchanged. Preserve Brevo, MongoDB URI, JWT secret, identity-storage key, origin, existing payment mode, and NODE_ENV=production / AUTH_DELIVERY_MODE=live / GHARSEVA_DEMO=false.
- One deliberate validation-policy change ships with the social code: an incomplete optional Google/Apple configuration becomes a warning and disables that sign-in capability instead of breaking unrelated password/email login. Tokens still fail closed. Production Firebase emulator configuration is explicitly rejected. If such an emulator variable exists on Render, startup will fail; actual Render settings were not inspected or changed.

## Safety and API contract checks

| Check | Result |
| --- | --- |
| OFF by default | PASS in code: Settings defaults false; missing public setting is treated as false; customer opt-in starts false. An existing explicit persisted activation would remain in effect after deployment, not be reset. Hosted current state was not queried. |
| Exact imported accounts only | PASS: stable IDs + account/profile markers + role/status/city/category/identity constraints; email domain is not authorization. |
| Real provider approval | PASS: identityApprovalGuard and the real application workflow are unchanged; imported profiles remain PENDING and identityRequired=true. |
| No ordinary demo booking/payment | PASS in mocked routes: creation, drafts, provider status actions and payment orders refuse imported demo identities even after a mistaken approval. Existing captured-payment reconciliation is retained. |
| Admin control | PASS: auth + admin role + recent administrator password/email-OTP proof on POST, explicit phrase, revision/manifest checks, audit and no-op repeats. Existing origin/session-context/CSRF middleware remains. |
| Customer/admin/provider password + email OTP | PASS in isolated/mocked existing tests. Owner reports hosted login success on the existing deployment; this new build has not been browser/hosted verified. |
| Client/server contract | PASS in source/build/route tests. GET /admin/faculty-showcase?enabled=1 supplies enabled/requestedEnabled, revision, fingerprint, counts, issues and exact confirmation. UI POST returns desired enabled, revision, fingerprint and confirmation; no IDs are accepted. |
| Public contract | PASS: /config facultyDemoAvailable; /providers and detail use facultyDemo=1; assistant body uses facultyDemo=true (query uses 1). Returned facultyDemo/facultyDemoLabel/bookingAllowed match UI use. |

The current source label uses a plain hyphen: `DEMO PROFILE - Fictional, not identity verified`. Client components display the returned label; this punctuation difference from the original requested em dash does not change the identity disclaimer or security boundary.

## Validation actually executed

```powershell
node --test server/test/faculty-showcase-unit.test.js server/test/city-demo.test.js server/test/payment-stages-unit.test.js server/test/payment-gateway-unit.test.js server/test/password-login-unit.test.js server/test/session-security-unit.test.js server/test/brevo-email-unit.test.js server/test/email-delivery-unit.test.js server/test/assistant-conversation-unit.test.js server/test/assistant-client-unit.test.js server/test/owner-demo-providers-unit.test.js server/test/demo-plus-alias-unit.test.js server/test/firebase-social-unit.test.js server/test/external-auth-unit.test.js server/test/checkout-unit.test.js server/test/payment-migration-unit.test.js
npm.cmd run build
git diff --check
```

- **224 passed, zero failed/skipped**. Real application/auth/signature/domain code was exercised with in-memory/mocked persistence, outbound delivery and gateway boundaries.
- Production build passed; main chunk approximately 603 kB, with Vite's non-fatal size warning. No dependency upgrade was performed.
- Diff check passed (Git may print CRLF/LF conversion warnings). Syntax/import inspection found no missing relative imports in the working runtime or candidate overlay.
- No connected database/full MongoDB suite or browser check was run. Prior isolated-loopback connect EACCES remains an environment limitation; no Atlas URI was substituted. Connected deployment/service-assistant tests are included for a supported isolated environment, not reported passed here.
- No real email, OAuth, Razorpay order/payment/webhook or hosted activation was performed.

## Exact staging manifest — instructions only, NOT executed

Recommended strategy: **one coherent integration commit** containing the current reviewed runtime + relevant tests/readiness/docs, followed later by a separate operator-tool commit. Suggested eventual title: “Add faculty showcase with compatible social-auth and assistant updates”. This review does not authorize an automatic commit/push/deploy. If you want a strictly showcase-only commit instead, stop here and have its mixed hunks isolated and retested; do not use this larger manifest while calling it showcase-only.

The following explicit allowlist includes **56 of the 66 original changes plus this report = 57 paths**. It intentionally leaves ten local operator/handoff/test files uncommitted. All unchanged tracked dependencies already in HEAD remain part of the commit's tree without being added again.

Run only after reading/reviewing the integrated scope. If HEAD or source files have changed since this review, repeat the review/tests first. These commands refuse a nonempty pre-existing index; they do not unstage or discard anyone's work.

```powershell
cd C:\workspace\GharSeva-MERN
if ((git rev-parse HEAD).Trim() -ne '26987f4d93a6c19844f68c40ff6e4c76fbd0d8e8') { throw 'HEAD changed. Repeat the review.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Index is not empty. Review existing staging first; nothing was reset.' }
$releaseFiles = @(
  'ASSISTANT-BOOKING-VERIFICATION.md'
  'CATALOG-AHMEDABAD-REPAIR.md'
  'FACULTY-DEMO-SHOWCASE.md'
  'GOOGLE-SIGNIN-LIVE-CHECKLIST.md'
  'RAZORPAY-TEST-HOSTED-CHECKLIST.md'
  'SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md'
  'SHOWCASE-DEPLOYMENT-REVIEW.md'
  'client/src/components/ContactVerification.jsx'
  'client/src/components/FacultyDemoToggle.jsx'
  'client/src/components/UI.jsx'
  'client/src/context.jsx'
  'client/src/external-identity.js'
  'client/src/pages/Applications.jsx'
  'client/src/pages/Dashboard.jsx'
  'client/src/pages/FacultyShowcaseAdmin.jsx'
  'client/src/pages/ProviderDetails.jsx'
  'client/src/pages/ServiceAssistant.css'
  'client/src/pages/ServiceAssistant.jsx'
  'client/src/pages/Services.jsx'
  'docs/CUSTOMER-ASSISTANT-UPDATE.md'
  'docs/HOSTING-DEPLOYMENT.md'
  'docs/LOGIN-TWO-STEP-SETUP.md'
  'docs/REGISTRATION-INTEGRATION-SETUP.md'
  'scripts/check-integrations.js'
  'scripts/owner-demo-journal.js'
  'server/.env.example'
  'server/.env.production.example'
  'server/src/app.js'
  'server/src/assistant-aliases.js'
  'server/src/assistant-analysis.js'
  'server/src/assistant-conversation.js'
  'server/src/assistant-matching.js'
  'server/src/demo-expansion.js'
  'server/src/deployment.js'
  'server/src/faculty-showcase.js'
  'server/src/firebase-identity.js'
  'server/src/identity-services.js'
  'server/src/models.js'
  'server/src/owner-demo-providers.js'
  'server/src/payments.js'
  'server/src/registration.js'
  'server/src/service-assistant.js'
  'server/src/social-readiness.js'
  'server/test/assistant-client-unit.test.js'
  'server/test/assistant-conversation-unit.test.js'
  'server/test/city-demo.test.js'
  'server/test/demo-plus-alias-unit.test.js'
  'server/test/deployment.test.js'
  'server/test/external-auth-unit.test.js'
  'server/test/faculty-showcase-unit.test.js'
  'server/test/firebase-social-unit.test.js'
  'server/test/owner-demo-providers-unit.test.js'
  'server/test/password-login-unit.test.js'
  'server/test/service-assistant.test.js'
  'shared/assistant-client-state.js'
  'shared/demo-email-aliases.js'
  'shared/external-auth.js'
)
foreach ($file in $releaseFiles) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'A manifest file is missing. Stop and review.' } }
git add -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Staging failed. Inspect the index; do not commit.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed. Stop and review.' }
git diff --cached --stat
git diff --cached --name-only
git status --short
```

Review the staged diff privately and confirm exactly this allowlist before any later commit. No `git add .`, `git add -A`, forced add, reset, stash, commit or push belongs in this review task. The ten intentionally deferred paths are:

```text
ADMIN-EMAIL-CORRECTION.md
CORE-FUNCTIONALITY-HANDOFF.md
OWNER-DEMO-PROVIDERS-HANDOFF.md
scripts/admin-email-plan.js
scripts/correct-admin-email.js
scripts/import-owner-demo-providers.js
scripts/owner-demo-diagnostic.js
server/src/admin-email-correction.js
server/test/admin-email-correction-unit.test.js
server/test/owner-demo-diagnostic-unit.test.js
```

**Always remain private/uncommitted:** server/.env and all actual environment/credential files, external GharSeva-private TXT/plans/archives/journals/locks, service-account JSON/private keys, .test-tmp guides/logs/database files, client/dist, node_modules, and screenshots containing secrets. Deferred source-code tools are different from these private artifacts: they may receive their own reviewed commit later; real credential artifacts must never be committed.

## Render behavior and owner verification after a later reviewed deployment

1. Commit/push only when the owner approves the full scope. Preserve the ten deferred files locally. Coordinate any automatic deployment behavior before pushing; the repository Blueprint's auto-deploy setting does not prove the existing service's setting. Use the existing service, not a replacement Blueprint/service that could generate new secrets.
2. Keep the existing build command `npm ci --include=dev && npm run build` and startup command below. No import/bootstrap/migration belongs in either. No new showcase environment variable or paid integration is required.

```sh
export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start
```

3. Deploy the reviewed commit using the owner's normal Render workflow; confirm its exact SHA and Live state in Render Events. This review did not inspect Render accounts or confirm which SHA is currently deployed. Do not replace environment variables from example files or rotate stable secrets as part of this release.
4. Expected startup: environment validation, existing MongoDB connection/index initialization, then the existing API/static client. No new showcase index, seed, account import or approval is introduced. Showcase remains OFF unless a previous explicit activation exists in persisted settings.
5. Check `/api/health`, `/api/auth/options` and `/api/config`. Health/flags are configuration/connection evidence only, not inbox or login proof. Expect the showcase public capability to be false before first activation. Optional Google/Apple can remain unavailable without disabling email OTP.
6. In separate browser profiles, owner-run customer/admin/provider password + fresh Brevo OTP checks should preserve role redirects/session behavior. Never share passwords/OTPs or use arbitrary recipients. Actual post-deployment logins remain unverified until performed.
7. As admin, open `/dashboard/admin?section=faculty-showcase`. Preview enabling first: GET `/api/admin/faculty-showcase?enabled=1` is read-only. Expect 20 exact pending matches, no issues and two available records per enabled category. Stop on conflicts; do not approve, re-import or change accounts to force the count.
8. Activation is a **separate intentional owner action** after deployment: type `ENABLE FACULTY DEMO SHOWCASE`, complete any required recent-admin proof, and apply visibility only. It writes Settings, not providers. This action was not performed in the review.
9. On Services choose Ahmedabad and opt in. Expect 20 labelled fictional cards (paginated), plus any normal approved real professionals; each available category contributes two demos. Check the plain/opted-in provider APIs, category filters, a different supported city, demo detail and assistant. Demo detail must have no booking/payment controls, ratings or verified-work claims. Plain discovery must exclude imports; the real pending application remains hidden. Use isolated tests, not real hosted bookings/orders, for negative write-route testing.
10. Refresh admin preview to confirm the twenty profiles still qualify as PENDING/identity-required. The applied setting records a bounded audit entry. Disable via preview + `DISABLE FACULTY DEMO SHOWCASE` when finished and refresh customer views. Ordinary approved real providers should remain.

## Blockers and limits

- No packaging/import/compilation blocker was found for the explicit integrated manifest. Owner review of its broader social/assistant scope is required; it is not a pure showcase-only commit.
- Connected database tests, actual browser/mobile behavior, post-deployment role logins, real Google/Apple, Razorpay TEST Checkout/webhooks and hosted showcase activation remain unverified. Prior EACCES is not a passing integration suite and was not repeatedly reproduced here.
- The legacy classroom defaults are public fixture values; do not reuse them as real credentials. The current private generated passwords/secrets did not appear in the scanned repository.
- The showcase is **display-only**. Real customer→provider booking/payment demonstrations still require eligible real providers or a separately isolated classroom/staging TEST workflow. No production demo auth, fake identity evidence, approval shortcut or pay-on-site bypass is introduced.
- Main-bundle size warning is non-fatal and is not addressed by unrelated optimization in this task.

**Next owner action:** read this manifest and choose whether to accept the integrated release scope. Nothing has been staged. Stop before executing the staging block until that review is complete.
