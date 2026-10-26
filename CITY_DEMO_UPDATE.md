# Saved cities and classroom demo update

Implemented directly in C:\workspace\GharSeva-MERN. No replacement project, ZIP, dependency upgrade or database reset.

## Behaviour

- Registration requires a supported city for customers/providers. User.city is retained; providers use matching profile.city. Server validation normalizes case/whitespace and the Ahemdabad alias. Invitation defaults no longer manufacture Ahmedabad for cityless recipients. Partial provider draft cities use the same validator.
- Existing saved cities are kept. Missing cities prompt once and save through /api/auth/me/city. A shared selected-city state drives home, listings, assistant and booking; browsing is separate from explicitly saving the default.
- Discovery and assistant matching query eligible local providers server-side. Booking and assistant draft confirmation recheck profile city. Full address remains required. City changes clear old results/comparison, assistant selection/locality/time/drafts and booking address/time; late listing/chat responses are discarded.
- The catalogue has 32 fictional professionals: 20 Ahmedabad (two per each of ten catalogue categories) plus the original twelve in other cities. Existing demo photos remain distinct. New profiles show an honest public work-photo placeholder; their private fictional PDF is never a public work image.
- Expansion defaults to dry-run, uses stable identities, adds missing records, preserves collisions, refuses production, validates creation passwords before writing and never updates existing account fields. Original seed still skips populated databases. No expansion runs at production startup.
- Provider seed/list/expansion share seed-data/demo-accounts.js. Customer/admin identities also come from that file. Temporary passwords live in scripts/demo-account-guide.js and are printed in the terminal only. Persistent passwords are neither recovered nor reset. Documentation and CSV regenerate from the same catalogue.

## Files changed

| Area | Files |
| --- | --- |
| Shared city / work images | shared/cities.js (new), shared/work-images.js |
| Server city / discovery / booking | server/src/cities.js (new), app.js, auth.js (optional session reuse for public discovery), models.js, registration.js, account-invitations.js, assistant-conversation.js, service-assistant.js |
| Demo data | seed-data/demo-accounts.js, server/src/seed.js, server/src/demo-expansion.js (new) |
| Commands / generated guide | package.json, scripts/demo.js, scripts/demo-accounts.js, scripts/demo-account-guide.js (new), scripts/expand-demo.js (new), scripts/write-demo-guide.js (new) |
| Client | client/src/App.jsx, context.jsx, styles.css, components/CitySelector.jsx (new), pages/CustomerRegister.jsx, ProviderRegister.jsx, Home.jsx, Services.jsx, Booking.jsx, ServiceAssistant.jsx |
| Guides | DEMO_ACCOUNTS.md (new), DEMO_WALKTHROUGH.md (new), DEMO-ACCOUNTS.md (redirect), DEMO-ACCOUNTS.csv |
| Checks | server/test/city-demo.test.js (new), assistant-conversation-unit.test.js, customer-registration.test.js, account-invitations.test.js, registration-workflow.test.js, service-assistant.test.js, api.test.js, payment-stages-unit.test.js, work-images.test.js, session-security-unit.test.js |

Existing integration fixtures now select their intended city explicitly. The old session-client assertion was aligned with the existing recursion-protection test: an identity recheck handles its own context-change error and must not schedule another recheck. No session-client production logic was changed for that assertion.

## Commands

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run demo:expand -- --dry-run
# Configure your existing MONGODB_URI and creation-only SEED_*_PASSWORD values first.
npm.cmd run demo:expand -- --apply
npm.cmd run demo:accounts
# Independent temporary classroom (instead of npm.cmd run dev):
npm.cmd run demo
```

DEMO_ACCOUNTS.md has every provider/customer/admin identifier, temporary password and the exact environment/creation commands. DEMO_WALKTHROUGH.md connects Kiran Patel's card to ahm.plumbing1@example.com / 9876520001 / Provider123 and documents the two-browser PENDING → ACCEPTED demonstration, 15-second visible-dashboard polling, refresh, login OTP, deposit, visit OTP, completion, final bill approval and remaining-balance simulation.

## Checks performed

- Write access verified by creating/removing a uniquely named temporary file inside this working copy. Applicable ancestor/project AGENTS.md paths and existing source/scripts were inspected. This working copy has no Git repository, so original changed files were retained in the local task scratch snapshot for comparison.
- Production build: npm.cmd run build — passed after the final client changes.
- Focused + preservation regressions: 111 tests passed across city-demo, assistant-conversation-unit, password-login-unit, payment-stages-unit, session-security-unit and work-images suites. Command:

  ```powershell
  node --test server/test/city-demo.test.js server/test/assistant-conversation-unit.test.js server/test/password-login-unit.test.js server/test/payment-stages-unit.test.js server/test/session-security-unit.test.js server/test/work-images.test.js
  ```

- City checks use actual registration/auth/assistant/booking route handlers with isolated model persistence. They check canonical customer/provider registration, saved defaults, explicit city saving, stale selection clearing, eligibility filtering, full address, cross-city rejection, assistant draft city revalidation, repeated expansion/preservation, collisions/production rejection, guide consistency, credential omission and the assigned provider's actual request-and-accept handler flow. Persistence is mocked; this is not real MongoDB or HTTP/browser verification.
- Existing payment, OTP, session/logout/account switching and distinct-photo unit regressions passed.
- npm.cmd run demo:accounts -- --write — passed; printed all 34 fictional identities and regenerated guide/CSV.
- npm.cmd test — attempted. Its MongoDB-backed suites failed during setup: the sandbox denied MongoDB's WiredTiger file rename; retrying a project-local test-data folder then hit EACCES connecting to 127.0.0.1. The full integration suite is not verified here. No setup error was hidden or labelled passing.
- npm.cmd run demo:expand -- --dry-run — attempted against the working-copy configuration; stopped with “Configure the existing MONGODB_URI in server/.env.” No live database expansion was applied. This session has neither server/.env nor a process MONGODB_URI.
- No browser verification, live email/Google/Apple verification, real database integration or real payment-gateway transaction is claimed. The classroom guide follows the implemented routes/buttons and existing payment handlers; its browser walkthrough still needs to be run in the user's normal local environment.
