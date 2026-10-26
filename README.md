# GharSeva 2 — MERN Home Services Platform

A complete redesign of the supplied React JSX project, with a connected Express / Node backend and MongoDB persistence.

**Begin with [START-HERE.md](START-HERE.md).** It covers a quick temporary demo, MongoDB Atlas, Postman and a classroom demonstration.

**Latest update (24 October):** [Hosting and deployment preparation](docs/HOSTING-DEPLOYMENT.md): Render configuration, production startup validation, database readiness, secure proxy handling, initial admin bootstrap and read-only deployment checks. A public URL requires your account setup; none has been deployed here. All earlier [test payments](docs/PAYMENTS-UPDATE.md), [admin invitations](docs/ADMIN-INVITATIONS-UPDATE.md), identity review, assistant, login and registration changes remain included. Final checks are recorded in [DEPLOYMENT-VERIFICATION.md](docs/DEPLOYMENT-VERIFICATION.md).

**23 October renovation baseline:** [fresh audit, first session-security fix and full renovation plan](docs/RENOVATION-PLAN.md). All 14 demo accounts passed email/password and mobile/password API login checks. The updated backend has 46 passing tests. The page redesign and new external integrations are planned in that document.

**Latest correction:** [provider registration and approval update](docs/APPROVAL-FIX-UPDATE.md). Both frontend and backend changed. See [all demo logins and faculty walkthrough](DEMO-ACCOUNTS.md).

Already installed and reviewing pages one at a time? See the [Home](docs/HOME-PAGE-UPDATE.md), [Services](docs/SERVICES-PAGE-UPDATE.md) and [Provider Profile](docs/PROVIDER-PROFILE-UPDATE.md) updates to apply frontend changes without reinstalling packages.

```sh
npm ci
npm run demo
```

For persistent Atlas data, configure server/.env, then:

```sh
npm run seed
npm run dev
```

## Highlights

- Clean white, navy and teal interface with local service photographs
- Home, services, profiles, booking, authentication, about, contact, terms and privacy pages
- Customer, provider and admin dashboards with real database records
- Conversational service assistant, reviewed booking drafts, provider comparison and visit OTP
- Server-side role/ownership checks, password hashing and HttpOnly sessions
- Atomic active-slot conflict index and validated booking transitions
- Provider photos, portfolios and private supporting documents stored in MongoDB
- Saved enquiries, addresses, favourites and completed-booking reviews
- Private encrypted verification images, local English OCR, name checks and human review
- Provider approval, suspension, category visibility and booking controls
- Optional test deposits, role-scoped payment ledger and clearly labelled receipts
- Admin customer/provider invitations with contact-bound recipient onboarding
- Postman collection and backend integration tests

## Layout

- client/ — React JSX, Vite, reusable components and page styles
- server/src/ — Express routes, Mongoose schemas, authentication and domain validation
- server/test/ — integration tests with a temporary MongoDB
- server/fixtures/ — a fictional PDF document for demonstrations
- seed-data/ — original service/provider data used to create fictional sample records
- scripts/demo.js — temporary local MongoDB + API + frontend launcher
- docs/ — Postman collection, project notes and verification report

## Commands

| Command        | Purpose                                      |
| -------------- | -------------------------------------------- |
| npm ci         | Install the locked dependencies              |
| npm run demo   | Run a temporary MongoDB-backed demonstration |
| npm run seed   | Seed an empty configured database            |
| npm run dev    | Run Atlas/local-Mongo API and Vite frontend  |
| npm run build  | Build the React application                  |
| npm start      | Serve the API and built frontend             |
| npm test       | Run API integration tests                    |
| npm run deploy:check | Validate production settings without connecting to providers |
| npm run deploy:smoke -- https://YOUR-HOST | Check a configured deployment without changing records |
| npm run deploy:bootstrap | Create the first admin with explicit operator settings |
| npm run format | Format source files                          |

Requires Node.js 22.12–24.x and npm; deployment is pinned to 24.22.1. MongoDB Atlas/local MongoDB is needed for persistent records. `npm test` builds the client before testing the production routes.

## Scope

Pay-on-site remains available. Optional visit deposits support a local simulation and a configured Razorpay test integration; live collection is not enabled. Priority requests are highlighted rather than guaranteed an emergency response. The service assistant defaults to explained rules. Optional OpenAI guidance is implemented but requires your API account and explicit customer consent; live model calls have not been tested in this environment. Dashboards refresh every 15 seconds while visible, not through WebSockets. Provider documents are reviewed by the project administrator; this does not represent professional external verification.

Seeded accounts and service photos are demonstration content. Do not describe them as actual customers, completed portfolio work or real identity checks.

## Current login flow

Password sign-in now requires a registered-email OTP for customers, professionals and administrators. Linked Google/Apple identities sign in directly for public roles. Restart the API after updating. See [the login setup and test guide](docs/LOGIN-TWO-STEP-SETUP.md) for classroom demo versus real local email, SMTP/Firebase/Apple settings and review commands.
