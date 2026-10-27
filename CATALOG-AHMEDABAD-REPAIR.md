# Catalog and Ahmedabad demo repair — 27 October 2026

Working folder: C:\workspace\GharSeva-MERN. Current files and the uncommitted Brevo milestone were retained. No ZIP, replacement project, dependency upgrade, push, deployment or Render setting change was made. The existing production startup command is unchanged.

## What was diagnosed

| Finding                                                      | Evidence and consequence                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed skips all work when any account exists                  | server/src/seed.js checks User.countDocuments before category initialization. An existing admin/customer can therefore coexist with a missing catalog; rerunning seed is not a repair.                                                                                            |
| First-admin bootstrap is intentionally separate              | server/src/bootstrap.js refuses an existing admin before initializing categories. It cannot repair the catalog after interrupted/older setup, and must not be used to create another admin.                                                                                       |
| Empty enabled catalog cascades into empty provider discovery | /api/categories filters enabled=true. publicProviders requires an enabled primary/secondary category as well as ACTIVE and APPROVED. Existing provider documents can therefore be present while discovery returns none.                                                           |
| City and availability also matter                            | /api/providers requires a supplied city or authenticated saved city, and profile.available=true. City matching normalizes whitespace/case and Ahemdabad. Anonymous calls without any city intentionally return an empty list.                                                     |
| Local database selection                                     | Configuration was inspected without connecting or printing values. Its URI has an explicit database path. The API uses that URI without a separate dbName override. This does not establish that the deployed service targets the intended database.                              |
| Previous demo coverage already existed                       | There are 32 stable provider definitions, including 20 Ahmedabad profiles, two per canonical category, and 12 in Bengaluru/Mumbai/Pune. New Ahmedabad profiles previously lacked distinct work images. Their identities were not replaced.                                        |
| Public UI conflated states                                   | Initial empty arrays looked like empty data before loading completed; the home page could show no preferred chips even with other enabled categories. Discovery now distinguishes actual loading, API failure, empty enabled catalog, missing city, empty city and filter misses. |
| Test startup had two infrastructure problems                 | Default sandbox temp paths caused WiredTiger rename permission errors, and two suites passed a Unix-only option on Windows. Workspace-owned paths and platform-specific flags now allow mongod to start.                                                                          |
| Remaining test environment block                             | A simple Node loopback probe returned connect EACCES, and the isolated database connection fails with the same error. This is not evidence of an application assertion defect. No saved/hosted URI was substituted.                                                               |

**The hosted database was not read, dry-run, seeded or changed in this milestone.** The historical public empty arrays do not identify which of the database/catalog/provider filters caused that deployment's result. The new diagnostic command is for the operator to establish those facts later. No claim is made that hosted records are absent, or that the live site is repaired.

## Catalog reconciliation

The operator command is separate from admin creation and demo expansion:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run catalog:reconcile
# Equivalent explicit read-only mode:
npm.cmd run catalog:reconcile -- --dry-run
```

It reads the selected database's categories and only the provider fields needed for aggregate eligibility counts. It reports:

- actual connected database name, total/enabled category counts;
- missing canonical categories, existing enabled/disabled categories and preserved custom categories;
- duplicate/noncanonical slugs, conflicting labels, malformed data and incompatible indexes separately;
- inactive/suspended, unapproved, unavailable, unsupported-city and no-enabled-category counts, plus eligible Ahmedabad count and account/profile city mismatches.

Reports contain no connection string, passwords, API keys, user contacts or identity documents. Dry run disables automatic model collection/index creation and performs no record/index writes.

Canonical defaults come from seed-data/services.js through server/src/canonical-catalog.js, reused by the existing seed/bootstrap/expansion paths. Existing names, IDs, prices, descriptions, enabled decisions and references are never overwritten.

Apply requires BOTH an explicit flag and exact URI/connected database confirmation. It inserts only genuinely missing categories using unique-slug $setOnInsert upserts. It creates the ordinary unique slug index only if absent and safe. It drops no indexes or collections. Conflicts refuse apply before changes. Disabled categories remain disabled; account creation, promotion and approval changes are outside this command.

### Later hosted use — instructions only, NOT executed here

1. Use the existing server-only MONGODB_URI for the intended saved database; keep all stable secrets and database name unchanged. Confirm that it is the intended service/database and take a backup using the owner's existing Atlas tools.
2. Run the read-only dry run above from a trusted terminal with permitted Atlas access. Review its printed database name, category/provider counts and conflict report.
3. Resolve conflicts deliberately with the operator; do not rename category slugs or re-enable categories automatically.
4. Substitute the **exact existing database name** below, without angle brackets:

```powershell
npm.cmd run catalog:reconcile -- --apply --confirm-db=EXACT_EXISTING_DATABASE_NAME
npm.cmd run catalog:reconcile -- --dry-run
```

Atlas SRV and replica-set URIs with explicit database paths are supported by the existing MongoDB-driver target parser. Missing database paths and incorrect confirmation fail before connecting. Confirmation is also checked against the connected database before writing. A network interruption can leave some missing categories inserted; rerun dry run and then the guarded command rather than deleting records. Repeated successful apply inserts zero duplicates.

Do not run demo expansion, bootstrap, seed, payment migration or role promotion against the hosted database for this milestone.

## Existing demo workflow, safely extended

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run test:db
npm.cmd run demo
```

Run in a normal local terminal where Node can reach loopback. The launcher:

- creates its own fresh local MongoDB database named gharseva_demo_* in .test-tmp/mongo;
- never loads or falls back to server/.env's saved database URI;
- reuses expandDemo rather than creating a second seed system;
- adds the canonical categories and 34 fictional accounts: customer, admin, 32 providers;
- uses reserved example.test addresses for newly created isolated accounts;
- provides 20 approved, available Ahmedabad sample providers across all ten canonical categories, plus existing supported-city examples;
- uses ₹ rates from the existing definitions, coherent category descriptions, service areas and 09:00/11:00/14:00/16:00 availability every day, with booking conflicts still checked;
- keeps the original twelve stock-image assignments and adds twenty distinct deterministic local service diagrams, explicitly labelled as fictional illustrations;
- creates no fake reviews, completed bookings or real identity credentials through expansion;
- uses the existing clearly fictional private DEMO-DOCUMENT.pdf convention, never real Aadhaar evidence;
- enables displayed classroom login codes and simulated payments only in this explicit non-production launcher;
- generates role passwords unless the owner supplied SEED_*_PASSWORD for new accounts, and stores them only in the ignored local guide;
- stops only its own child/frontend/database processes on shutdown. Temporary records are discarded.

All default category writes are insert-only. Existing users, hashes, account/profile cities, approvals, uploaded files, applications and bookings are preserved on repeat expansion. Identifier collisions are reported and preserved. Existing disabled categories remain hidden; with some disabled, only the enabled subset is discoverable.

### Ignored account guides

Actual newly created local demo accounts are written on successful launch/guarded expansion to:

```text
C:\workspace\GharSeva-MERN\.test-tmp\demo-accounts.local.md
```

The file lists role, email username, city, category and creation-time password source. Passwords are not printed or committed. Repeat runs do not recover/reset existing passwords or invent credentials for preserved/conflicting accounts. npm.cmd run demo:accounts now reports definitions/guide availability without printing credentials. Its legacy --write flag no longer exports static credential tables to tracked source files.

Because real MongoDB connectivity was blocked here, **the active demo guide was not created and no connected demo server is claimed**. A separate guide was generated for newly created in-memory regression fixtures:

```text
C:\workspace\GharSeva-MERN\.test-tmp\catalog-fixture-accounts.local.md
```

It is labelled IN-MEMORY TEST FIXTURE ONLY and cannot be used to sign in to a running MongoDB-backed app. Both paths were verified ignored by Git. The older tracked DEMO_ACCOUNTS/DEMO-ACCOUNTS lists remain historical reference and now point to this workflow.

For hosted demonstrations use normal registration/invitations with stored inboxes the operator controls. Reserved/fictional addresses cannot receive actual OTPs. Brevo setup and owner-confirmed inbox delivery remain pending; no production classroom codes or OTP bypass was enabled.

### Expand a separate persistent local demo database, if needed

This option defaults to dry run and refuses production. For writes, all URI hosts must be loopback and the database must have an isolated gharseva_demo_* or gharseva_test_* name. Exact confirmation and explicit classroom flags are required. Never replace the saved .env file with these temporary settings.

In a separate trusted local terminal, with a local MongoDB instance running:

```powershell
$env:NODE_ENV = 'development'
$env:GHARSEVA_DEMO = 'true'
$env:AUTH_DELIVERY_MODE = 'test'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/gharseva_demo_catalog_review'
npm.cmd run demo:expand -- --dry-run
npm.cmd run demo:expand -- --apply --confirm-db=gharseva_demo_catalog_review
npm.cmd run demo:expand -- --dry-run
npm.cmd run demo:accounts
```

These process-only settings belong to this isolated demo terminal, never Render. Close the terminal afterward. This sequence was not executed against a connected database here. Ordinary npm.cmd run demo is simpler and does not need a manually supplied URI. No existing shared development/hosted database is an acceptable fallback.

## Booking walkthrough for faculty

Use separate browser profiles for customer, assigned provider and admin so shared-browser account switching does not mix their sessions. Once the isolated demo launches successfully:

1. Read the private local guide. Sign in through the normal password then classroom-labelled email OTP steps. Choose/save Ahmedabad for the demo customer.
2. Browse an enabled category and select an Ahmedabad sample professional. The popular chips, service cards and guided assistant use the enabled catalog. Changing city should show the existing other-city fixtures.
3. Choose an available future slot and enter a fictional full service address. Send the request. The correct provider sees the same PENDING booking; another provider cannot accept/reject it.
4. The assigned provider accepts. Refresh customer/provider/admin views and compare booking ID/status. Admin may view but cannot accept as the provider.
5. Review the ₹99 deposit credit and use explicitly labelled classroom simulation. A missing/failed deposit must block work even if the customer provides the visit OTP.
6. After captured demo deposit, provider marks On the Way, then starts with the customer's visit OTP. Wrong OTP remains rejected. Complete the service.
7. Submit the itemised ₹349 final bill. Customer approval is required before balance checkout; correction/history and approved-extras rules remain intact.
8. The remaining balance is ₹250, in a separate payment record/order. Simulate capture, then compare the combined ₹349 total and zero remaining balance. Service completion and provider payout remain separate; payout stays NOT_INITIATED.

No pay-on-site bypass was added. If payment mode is disabled, the API returns a clear setup state and no paid status is manufactured. Actual Razorpay TEST Checkout, capture/webhook delivery and refunds remain unverified.

## Test infrastructure and supported isolated setup

The nine existing database-backed suites and the new catalog integration suite use scripts/isolated-mongo.js. It creates a unique workspace directory and database, uses MongoDB 7.0.24 on 127.0.0.1, bounds WiredTiger cache, excludes --nounixsocket on Windows, and bounds connection selection to four seconds. Cleanup handles failed startup without an undefined-server error or unresolved close promise. Seed module imports no longer load the owner's .env into unit tests; only the explicit seed CLI loads it.

The original diagnostic captured:

```text
WiredTiger.turtle.set -> WiredTiger.turtle
MoveFileExW: Access is denied
Permission denied (error 13)
Fatal assertion 50853 / fassert failure
```

After using the workspace path, mongod started successfully. The remaining failure is:

```text
Isolated MongoDB connection failed (connect EACCES: loopback denied by environment).
No saved database was used.
```

A standalone Node server/client loopback probe also returned EACCES. No security, antivirus, firewall or browser protections were disabled.

On the owner's normal local terminal:

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run test:db
npm.cmd run test:catalog
npm.cmd test
npm.cmd run build
```

test:db must pass before treating connected integration results as verified. mongodb-memory-server may need its normal MongoDB binary download/cache access. If using an already installed compatible binary, its documented MONGOMS_SYSTEM_BINARY setting can point to that binary; it still launches a fresh local test database, not the existing MongoDB service/database. Do not use the hosted URI to fix an isolated fixture.

## Actual verification evidence

Runtime: Node v24.13.1 (within the project engine range). No dependency or lockfile update.

| Command/check actually run                                                           | Result                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm.cmd run test:catalog                                                             | **69 passed, 0 failed**: reconciliation guards, city/demo/image preservation and payment gates                                                                          |
| Combined focused preservation command below                                          | **170 passed, 0 failed**: includes Brevo/SMTP, shared login, sessions, assistant, cities, images, payment stages/migration, external-auth mocks and test infrastructure |
| npm.cmd test                                                                         | Build passed; **349 tests: 170 passed, 179 failed at isolated MongoDB setup**; no assertion failure observed in the full-run log                                        |
| npm.cmd run build after the final UI changes                                         | **Passed**                                                                                                                                                              |
| node --test server/test/catalog-integration.test.js                                  | **Blocked/failed** at isolated loopback connection before catalog writes                                                                                                |
| npm.cmd run test:db                                                                  | mongod process started in the workspace; connection failed with **connect EACCES**                                                                                      |
| Standalone Node loopback server/client probe                                         | **connect EACCES**                                                                                                                                                      |
| npm.cmd run demo:accounts                                                            | Read-only definition summary: 34 accounts, 20 Ahmedabad provider definitions; no active connected guide claimed; no passwords printed                                   |
| git check-ignore for both local guide paths                                          | **Passed**                                                                                                                                                              |
| git diff --check                                                                     | **Passed**                                                                                                                                                              |
| Browser tooling availability                                                         | **Blocked**: codex app-server program not found                                                                                                                         |
| Hosted catalog/provider state, actual email/social sign-in, actual Razorpay/webhooks | **Unverified and not exercised**                                                                                                                                        |

Exact combined focused command:

```powershell
node --test server/test/catalog-reconciliation-unit.test.js server/test/isolated-mongo-unit.test.js server/test/brevo-email-unit.test.js server/test/email-delivery-unit.test.js server/test/password-login-unit.test.js server/test/session-security-unit.test.js server/test/assistant-conversation-unit.test.js server/test/city-demo.test.js server/test/work-images.test.js server/test/payment-stages-unit.test.js server/test/payment-migration-unit.test.js server/test/external-auth-unit.test.js
```

Evidence logs (ignored local files):

- .test-tmp/catalog-focused.log
- .test-tmp/catalog-preservation.log
- .test-tmp/catalog-full-suite.log
- .test-tmp/catalog-booking-flow.log
- .test-tmp/catalog-mongo-debug.log
- .test-tmp/catalog-mongo-integration.log
- .test-tmp/catalog-test-db-check.log

The earlier report's 183 failures included cleanup problems. This run reports 179 database setup failures after those cleanup fixes and after adding catalog coverage. Neither result is a passing full suite. No failures were silently skipped or converted to successful exits.

The browser helper was inspected through the computer-use skill. Initialization/availability failed with: codex app-server: program not found. No customer/provider/admin browser profile walkthrough, mobile layout or browser screenshot is claimed.

The combined journey used real route/auth/booking/billing/payment handlers with atomic in-memory persistence and explicit demo outcomes. It exercised normal password-plus-OTP session issuance, saved-city discovery, provider ownership, admin reads, refreshes, wrong OTP, failed/unpaid deposit, approval, distinct deposit/balance records, correct credit deduction and no payout. Outbound email/gateway providers were mocked or not invoked. This is separate from a connected MongoDB/HTTP browser demonstration and external integration evidence.

The actual new catalog MongoDB test was attempted and failed before data writes at the isolated connection step. Therefore real-Mongo reconciliation/index mutation and connected demo initialization remain unverified here. Catalog dry-run/apply/idempotence/conflict behavior and demo account preservation were verified with isolated in-memory fixtures.

## Changed files in this milestone

| Files                                                                                                                                             | Purpose                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| server/src/canonical-catalog.js; server/src/catalog-reconciliation.js; scripts/reconcile-catalog.js                                               | shared canonical defaults, read-only diagnosis, insert-only guarded reconciliation                                                       |
| server/src/seed.js; server/src/bootstrap.js                                                                                                       | reuse canonical defaults; keep seed/admin guards; avoid loading saved .env on seed module import                                         |
| server/src/demo-expansion.js; server/src/demo-target.js                                                                                           | extend existing additive expansion, conflict prechecks, strict isolated CLI target and classroom guards                                  |
| scripts/demo.js; scripts/expand-demo.js; scripts/local-demo-guide.js; scripts/demo-accounts.js; scripts/write-demo-guide.js                       | reuse expansion in the fresh launcher, reserved addresses, ignored new-account guide and no credential printing                          |
| scripts/generate-demo-illustrations.js; client/public/images/demo-illustrations/*.svg (20); seed-data/demo-work-images.js; shared/work-images.js  | stable local diagrams and honest labels, preserving the twelve existing photos and genuine-upload precedence                             |
| server/src/app.js                                                                                                                                 | optional enabled-category filtering on public provider API, including secondary categories; existing ownership/payment handlers retained |
| client/src/context.jsx; shared/discovery-state.js; client/src/components/DiscoveryNotice.jsx                                                      | public loading/error/result states and response validation, separate from protected session state                                        |
| client/src/pages/Home.jsx; Services.jsx; ServiceAssistant.jsx; client/src/components/CitySelector.jsx; UI.jsx                                     | enabled-catalog chips, accurate empty/error/loading UI, city action target and fictional profile badges                                  |
| scripts/isolated-mongo.js; scripts/check-test-database.js                                                                                         | workspace-owned disposable database setup and no-saved-URI diagnostic                                                                    |
| server/test/catalog-reconciliation-unit.test.js; catalog-integration.test.js; isolated-mongo-unit.test.js; city-demo.test.js; work-images.test.js | reconciliation, fixtures, expanded discovery/booking/payment regression and image coverage                                               |
| Existing account-invitations/api/customer-registration/deployment/login/payments/provider-identity/registration-workflow/service-assistant tests  | use the shared isolated MongoDB fixture and safe failed-setup cleanup, without weakened assertions                                       |
| package.json; CATALOG-AHMEDABAD-REPAIR.md; docs/HOSTING-DEPLOYMENT.md; DEMO_ACCOUNTS.md; DEMO-ACCOUNTS.md                                         | operator/test scripts, evidence and updated demo/catalog instructions                                                                    |

Pre-existing Brevo/SMTP implementation, diagnostics and documentation were not replaced. Stable secrets, roles, saved data, two-stage payment implementation, provider identity code and external-auth integrations were not changed. No lockfile or dependency change.

## Remaining external and hosted work

- Operator catalog dry run to establish the real deployed database/catalog/provider state, then separately reviewed insert-only apply if needed.
- Real provider onboarding/approval with genuine authorized evidence; do not publish these fictional fixtures as real professionals.
- Successful isolated MongoDB integration suite and connected desktop/mobile faculty walkthrough in an environment permitting loopback.
- Brevo account/API sender setup and owner-confirmed registration/login/recovery email delivery.
- Razorpay TEST deposit/balance, actual signed webhook delivery and refund reconciliation.
- Existing payment-copy consistency audit.
- Actual Google/Apple account configuration and sign-in.
- Fresh dependency audit and targeted updates.
- Final hosting readiness review.

Local code and fixture behavior are ready for review. Hosted catalog recovery, actual email/social/payment operation and complete release approval are not claimed.
