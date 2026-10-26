> Historical milestone results only. Current working-folder verification and remaining blockers: [FINAL-HOSTING-REVIEW.md](FINAL-HOSTING-REVIEW.md).

# Deployment verification — 24 October 2026

## Completed locally

- `npm test`: **161 passed, 0 failed, 0 skipped**. This includes the previous 151 tests plus 10 deployment tests. It builds the React client before running the backend suite.
- `npm run build`: production Vite build passed on Node **24.22.1**. A build also ran as part of the full test command.
- A real `server/src/index.js` process ran with `NODE_ENV=production`, a temporary MongoDB, a stable test storage key, an HTTPS configured origin and classroom authentication disabled. It served healthy API responses and anonymous-session rejection and exited with status 0 on SIGTERM. The database still contained the test admin afterward.
- The read-only deployment smoke CLI passed against the local production-configured app: `/`, `/login`, `/register`, `/admin/login`, database readiness, liveness, bundled JavaScript, missing assets/API endpoints and anonymous `/api/auth/me` access.
- Production tests checked Secure/HttpOnly/SameSite cookies, HSTS, CSP, exact Origin enforcement, proxy-aware rate limiting, draining, database disconnect handling, storage-key/config refusal, and startup refusal for an absent client build.
- Bootstrap tests checked hashed passwords, minimum admin password length, contact collisions, repeat-run refusal, no fabricated contact verification and preservation of an existing customer's role and existing category settings.
- `render.yaml` and the GitHub workflow were parsed as YAML locally. Their settings were compared with the linked official documentation. Neither was submitted to an authenticated hosting/CI account for validation or execution.

Tests use temporary fictional data, including local fixtures and mocked external transports in the earlier suites. No existing customer database or real identity image was accessed or changed. The production-start test uses a temporary persistent MongoDB process for the lifetime of that test; it is not a live Atlas deployment or backup.

## Account-dependent checks still required

No public Render URL, custom-domain TLS, Atlas connection from the host, real SMTP/SMS delivery, Firebase login, live AI request or Razorpay test checkout/webhook was exercised. The initial admin was created only in the temporary test database. No operator account was created for the user and no paid service was provisioned.

There are no page-design changes in this milestone. Earlier desktop/mobile screenshots were not recaptured; this milestone's frontend checks cover production HTTP delivery and assets, not browser rendering. A hosted browser walkthrough and resource measurements, especially local OCR memory on the selected compute plan, remain required.

## Main changed files

- `render.yaml`, `.node-version`, `.github/workflows/verify.yml`
- `server/src/deployment.js`, `server/src/index.js`, `server/src/app.js`
- `server/src/bootstrap.js`, `server/test/deployment.test.js`
- `scripts/check-production.js`, `scripts/bootstrap-production.js`, `scripts/smoke-deployment.js`
- `server/.env.example`, `server/.env.production.example`, `.gitignore`
- `package.json`, `package-lock.json`, `README.md`, `START-HERE.md`
- `docs/HOSTING-DEPLOYMENT.md`, this report

See [HOSTING-DEPLOYMENT.md](HOSTING-DEPLOYMENT.md) for the setup, storage-key migration, first-admin creation, smoke checks and rollback procedure. The packaged ZIP retains all earlier login, registration, provider review, invitations, booking, assistant and test-payment work.
