# GharSeva hosting and deployment — 24 October 2026

**Email milestone updated 27 October 2026:** see [EMAIL-OTP-RENDER.md](EMAIL-OTP-RENDER.md) for the selected Brevo HTTPS transport, exact Render variables and owner inbox test. Historical verification counts below are not results for this update.

This package prepares the existing MERN project for a single public HTTPS URL. It does not create a hosting account, publish the repository, buy a plan, change your database, or claim a deployed URL. All earlier pages and workflows are included.

## What runs where

The React production build and Express API run together as **one Node web service**. Browser requests use the same origin and `/api`, so no separate frontend host, frontend database secret or cross-site session setup is needed. Express binds to `0.0.0.0` and the host's `PORT`. MongoDB Atlas holds accounts, bookings, application drafts, payment records and uploaded files, including encrypted identity images. These uploads do not depend on Render's local disk.

The included `render.yaml` is an account-side deployment recipe. Its Free plan is for an initial preview; it creates no resources until you submit it. Render Free sleeps after inactivity, has no service shell, and blocks the common SMTP ports used by this project. **Use EMAIL_TRANSPORT=brevo for HTTPS email delivery on Render Free.** SMTP remains available on hosts that permit its ports. Brevo account/API credentials, sender verification and owner-confirmed inbox receipt are required; configuration alone does not prove delivery. Do not present Free preview hosting as a complete production service. OCR memory/latency must also be measured on the selected host. Nothing in this update purchases a plan.

## 1. Review the local package

Work in the existing source folder; do not overwrite newer work with an older ZIP. On Windows, open a terminal inside `GharSeva-MERN`:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run demo
```

`npm test` builds the client first, then runs the backend suite. The temporary demo remains at `http://localhost:5173`. It is separate from public hosting and must never be your public start command. For a hosted production process, use `npm start` after building and configuring the environment.

## 2. Preserve the existing database and storage key

If you already have persistent records, keep the same MongoDB database name and take a backup using your own Atlas/Database Tools access before deployment. The temporary `npm run demo` database is not persistent and cannot be recovered after its process ends. No existing database was accessed during this milestone.

Keep the existing `IDENTITY_STORAGE_KEY` unchanged across restarts, deploys and rollback. Back up that key separately from the database. A database backup without the matching key cannot decrypt identity images. If earlier local verification images were encrypted **without** an explicit storage key, they used SHA-256 of `gharseva-identity-v1:` followed by the original `JWT_SECRET`. Before migrating those records, derive their matching key on your own machine using that original secret:

```powershell
# Original server/.env must still contain the secret used for those images.
node -e "require('dotenv').config({path:'server/.env'}); if(!process.env.JWT_SECRET) throw Error('Original JWT_SECRET required'); console.log(require('crypto').createHash('sha256').update('gharseva-identity-v1:'+process.env.JWT_SECRET).digest('hex'))"
```

Copy the resulting private value into the host's `IDENTITY_STORAGE_KEY`, then clear the terminal. Do not derive a new key from an unrelated/new JWT secret. If the original key/secret is unavailable, request new provider evidence rather than claim old evidence was preserved. This guide does not re-encrypt old ciphertext.

Startup waits for the models' declared indexes. It does not call `syncIndexes`, drop collections, reset users or seed records. If a declared unique index fails because historical records conflict, stop and inspect the records from your backup; do not delete records or drop indexes blindly.

## 3. Put the code in your own private Git repository

Create a private repository through your own Git account and upload the **contents** of `GharSeva-MERN` so `package.json` and `render.yaml` sit at its root. Include `.github`, `.node-version`, assets, `client`, `server`, `scripts`, `seed-data`, docs and the lockfile. Exclude `node_modules`, `client/dist`, actual `.env` files, downloaded credentials, logs and database exports. The example environment files are safe templates.

The included GitHub Actions workflow installs locked dependencies and runs the build/tests. GitHub Actions and Render have not been connected or executed in your account. Auto-deploy is disabled in the Blueprint; use a reviewed commit and manual deployment until your hosted checks pass. You can later choose Render's `checksPass` policy for CI-gated deployments.

## 4. Configure Atlas access

Use your existing Atlas database, or create a separate GharSeva database if starting fresh. Create a database user restricted to the GharSeva database rather than an unrestricted administrator. Copy the application's driver connection string, include `/gharseva` (or your **existing** database name), and percent-encode special characters in the database password. Do not put the URI in React or a `VITE_` setting.

Create/select the Render service, then open its **Connect → Outbound** tab. Add the displayed outbound CIDR ranges to Atlas **Network Access**. Also allow your own current IP temporarily if you will run bootstrap from your computer. Remove that temporary entry afterward. Do not solve connection problems by permanently opening access to all addresses. Render outbound ranges are shared; database credentials remain required.

## 5. Create the Render web service

Sign into your own [Render dashboard](https://dashboard.render.com). Either select **New → Blueprint** and connect the repository containing `render.yaml`, or choose **New → Web Service** and enter these values manually:

| Setting        | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| Language       | Node                                                                               |
| Root directory | Repository root; leave blank if the files are already at root                      |
| Region         | Singapore, or your chosen region near the database                                 |
| Node version   | `24.22.1`, pinned in `.node-version` and the Blueprint                             |
| Build command  | `npm ci --include=dev && npm run build`                                            |
| Start command  | `export CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" && npm run deploy:check && npm start` |
| Health check   | `/api/health`                                                                      |
| Instances      | One; current rate limiting and OCR scheduling are process-local                    |
| Auto deploy    | Off initially                                                                      |

Choose the plan deliberately in your account. The Blueprint's `plan: free` is only a preview default. Its limits do not meet every workflow's needs. No persistent disk is required for the current MongoDB-backed upload design. Do not create a Render Postgres database; this is a MongoDB project.

Copy the **actual assigned public URL**. Service-name availability can change it. Set `CLIENT_ORIGIN` to that exact origin with `https://`, without `/` at the end. If the first launch fails because you did not yet know the URL or outbound ranges, update those settings and redeploy. Do not use an assumed URL.

### Required server settings

Use Render's private environment settings. `server/.env.production.example` is a reference, not an active secrets file. Do not upload a real `.env` to Git.

| Variable                        | Value/purpose                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `production`                                                                                                  |
| `MONGODB_URI`                   | Your Atlas URI with the correct persistent database name                                                      |
| `JWT_SECRET`                    | Stable, randomly generated secret of at least 32 characters; Blueprint can generate it for a new installation |
| `IDENTITY_STORAGE_KEY`          | Stable 64-character hex key; retain the existing key for existing images                                      |
| `CLIENT_ORIGIN`                 | Exact public HTTPS origin; no path or trailing slash                                                          |
| `TRUST_PROXY_HOPS`              | `1` for this documented Render topology; local direct server uses `0`                                         |
| `GHARSEVA_DEMO`                 | `false`                                                                                                       |
| `AUTH_DELIVERY_MODE`            | `live`                                                                                                        |
| `REQUIRE_VERIFIED_REGISTRATION` | `true`                                                                                                        |
| `REQUIRE_PROVIDER_IDENTITY`     | `true`                                                                                                        |
| `PAYMENTS_MODE`                 | `disabled` until your Razorpay test account is configured                                                     |

Generate a **new installation's** identity key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not use a newly generated key for existing ciphertext. For a manually configured new JWT secret, use 48 random bytes in hex. Keep secrets out of chat, screenshots and commits. Never change production to test/demo authentication to make public OTP appear to work.

`TRUST_PROXY_HOPS` affects client-IP rate limits. Do not set it to `true`. Recheck the proxy path if adding a CDN, another reverse proxy or another host; the existing hop count is not a universal configuration. Use one canonical domain because writes from any different Origin are rejected. On a domain change, update `CLIENT_ORIGIN`, redirect the previous domain through your host, and update Firebase/payment callbacks.

### Required email; optional services configured separately

- **Email (required for password login):** on Render Free set EMAIL_TRANSPORT=brevo, BREVO_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME=GharSeva, with AUTH_DELIVERY_MODE=live and GHARSEVA_DEMO=false. SMTP is a separate alternative using only SMTP_* settings when selected. Customer/provider/admin password login always requires a stored-email OTP, including mobile identifiers. No Twilio configuration is needed. See [EMAIL-OTP-RENDER.md](EMAIL-OTP-RENDER.md).
- **SMS:** configure Twilio Verify settings in [REGISTRATION-INTEGRATION-SETUP.md](REGISTRATION-INTEGRATION-SETUP.md). No SMS account is provided.
- **Google/Apple:** add the public hostname to Firebase's authorized domains; configure the enabled provider and server credentials. Use a hosting secret file or the documented private-key environment settings. Never bundle a service-account JSON into React. Follow [SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md](../SOCIAL-SIGNIN-SETUP-AND-VERIFICATION.md); use the actual Firebase auth handler domain, and validate Google/Apple independently.
- **AI:** guided matching works without a key. Optional live AI uses server-side settings in [CUSTOMER-ASSISTANT-UPDATE.md](CUSTOMER-ASSISTANT-UPDATE.md).
- **Payments:** keep `disabled` or configure `razorpay_test` with your test keys. Set the signed webhook to `https://YOUR-ACTUAL-HOST/api/payments/webhook`; follow [RAZORPAY-TWO-STAGE-VERIFICATION.md](../RAZORPAY-TWO-STAGE-VERIFICATION.md). New bookings require deposit and approved balance even while checkout is unavailable. Run `npm run integrations:check -- --payments-ready` for configuration validation only. Real collection remains unavailable.
- **Aadhaar:** local OCR/name comparison remains assisted human review; hosting does not activate UIDAI authentication.

## Catalog repair for an existing database

An existing admin does not prove the category catalog was initialized. Use the separate, read-only-by-default reconciliation workflow in [CATALOG-AHMEDABAD-REPAIR.md](../CATALOG-AHMEDABAD-REPAIR.md). It reports missing/disabled/conflicting categories and requires an exact database-name confirmation before insert-only apply. Do not rerun bootstrap or seed to repair the catalog. Never expand fictional providers into the hosted database; demo writes are restricted to explicit non-production loopback databases.

## 6. Create the first admin only if none exists

If the database already has an admin, use that account. **Do not seed or rerun bootstrap to reset it.** A new database can use `npm run deploy:bootstrap`, an operator-only command with no public route. It creates a strong-password admin plus missing service categories, with no fictional customers/providers/bookings and no automatic contact-verification claim. Existing category values and other accounts are preserved. It refuses an existing admin or a colliding email/mobile and never converts an account's role.

On a local trusted terminal, configure the target Atlas URI securely in `server/.env` (not Git), then run:

```powershell
$env:BOOTSTRAP_CONFIRM = 'CREATE_FIRST_ADMIN'
$env:BOOTSTRAP_ADMIN_NAME = 'Your administrator name'
$env:BOOTSTRAP_ADMIN_EMAIL = 'your-real-admin@example.com'
$env:BOOTSTRAP_ADMIN_MOBILE = 'YOUR_10_DIGIT_MOBILE'
$secret = Read-Host 'New admin password (12+ characters, uppercase, lowercase and number)' -AsSecureString
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
try { npm.cmd run deploy:bootstrap } finally {
  Get-ChildItem Env:BOOTSTRAP_* | Remove-Item
  Remove-Variable secret -ErrorAction SilentlyContinue
}
```

Substitute your own details. Enter the password at the hidden prompt, not inside a command or chat. Run from one terminal once, not as a build/start hook or concurrently. On supported paid services the same command can be run in the host's private service shell using temporary private settings; remove all `BOOTSTRAP_*` settings afterward. Free Render has no service shell, so use the local Atlas route above. The legacy /admin/login redirects to shared /login; admins also require password followed by registered-email OTP. Sensitive actions retain session-bound password-plus-email-OTP reauthentication. Bootstrap does not bypass email or solve recovery. Do not run `npm run seed` against the public production database.

## 7. Verify the actual deployment

Once the host reports healthy, run from your computer:

```powershell
npm.cmd run deploy:smoke -- https://YOUR-ACTUAL-SERVICE.onrender.com
```

This read-only script checks database readiness, liveness, home/login/register/admin page refreshes, built JavaScript delivery, CSP, HTTPS HSTS, missing-resource responses and anonymous session rejection. It does not create users/bookings or validate external accounts. Free-host wakeup can exceed the check's timeout; wait for the service to wake and retry.

In a browser, separately check customer registration with a real delivered code, customer/provider/admin password login in separate profiles, saving/resuming a provider application, private identity previews and a fictional document review, provider acceptance, booking conflict handling and the service-start OTP. Restart/redeploy and confirm those records still exist. Test payment success/failure, callback and webhook reconciliation **using only your own configured test account**. Keep the original human approval and booking requirements throughout.

`/api/health` returns 200 only while MongoDB responds to a bounded ping and the process is not draining; otherwise 503. `/api/health/live` checks the process alone. Neither exposes account records or configuration secrets. Shutdown stops accepting connections, drains requests, then disconnects MongoDB, with a 25-second deadline. An interrupted OCR/upload can be retried; it is not claimed to have completed.

## 8. Updates, backup and rollback

Deploy a tested commit manually; run the smoke check again and review errors. Keep the previous ZIP/commit. If a release fails, redeploy the previous known-good commit with the same database and matching storage key. Code rollback does not undo database writes. Restore a database backup into a separate database for inspection before any deliberate restoration. Do not regenerate the storage key during rollback. Rotating JWT ends existing sessions and pending contact sessions; it also affects any legacy fallback-encrypted files unless their original matching identity key was saved first.

This build has process-local general rate limits and one-at-a-time OCR. Use one instance. Horizontal scaling needs shared rate-limit storage and a shared worker queue; no autoscaling is configured. Atlas backups, retention, resource monitoring and alerting require configuration in your accounts. There is no automatic backup service in this package.

## Validation recorded for this milestone

The deployment tests run against a temporary MongoDB and a real local production entry process. They cover configuration refusal, readiness with a disconnected database, draining, first-admin/bootstrap preservation, secure session cookies, origin checks, forwarded-IP rate limits, built routes/assets, and clean SIGTERM shutdown. They do not contact your Atlas account or use real document/payment/contact data. See [DEPLOYMENT-VERIFICATION.md](DEPLOYMENT-VERIFICATION.md) for the final counts and limits.

No Render service, Git repository, Atlas cluster, domain, TLS certificate, external delivery account or public checkout was created/tested in your account. A public URL remains pending your account setup. No paid resources were provisioned.

## Official references checked on 24 October 2026

- [Render Node/Express deployment](https://render.com/docs/deploy-node-express-app)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render web-service binding](https://render.com/docs/web-services)
- [Render HTTP health checks](https://render.com/docs/health-checks)
- [Render Node version selection](https://render.com/docs/node-version)
- [Render Free limitations, including SMTP and shell restrictions](https://render.com/docs/free)
- [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses)
- [MongoDB Atlas network access](https://www.mongodb.com/docs/atlas/setup-cluster-security/)
- [Express reverse-proxy configuration](https://expressjs.com/en/guide/behind-proxies/)
