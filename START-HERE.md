# GharSeva — start here

A redesigned React JSX + Express + Node.js + MongoDB college project.

**Hosting milestone:** [HOSTING-DEPLOYMENT.md](docs/HOSTING-DEPLOYMENT.md) covers Render + Atlas, production settings, preserving encrypted documents, initial admin creation and deployment checks. `render.yaml` is included. No public deployment or paid resource has been created. The existing local demo still works below.

**New registration workflow:** run `npm ci` after this update. `npm run demo` enables clearly labelled classroom codes for email/mobile; no messages are sent. See [registration walkthrough and live setup](docs/REGISTRATION-INTEGRATION-SETUP.md) for saved provider forms, the admin queue, Google/Apple and delivery configuration.

**Login entries:** customer `/login` or `/customer/login`, professional `/provider/login`, administrator `/admin/login`. Public login pages show password, Google, Apple, email OTP and phone OTP choices. Demo customer/provider contacts support classroom codes and password recovery; administrator access remains password-only. See [login update](docs/LOGIN-REQUIREMENTS-UPDATE.md).

**New customer service assistant:** open **Service assistant** in the navigation (or `/assistant`). Guided matching runs without an AI account. Describe a problem, choose a professional, pick a live slot, review and confirm the booking request. Optional AI setup and a full walkthrough are in [CUSTOMER-ASSISTANT-UPDATE.md](docs/CUSTOMER-ASSISTANT-UPDATE.md). Earlier login and registration work is included.

**New provider identity review:** run `npm ci` after replacing the project files; this installs local OCR, English language data and image processing. In the provider dashboard open **Identity verification**. Download the fictional sample front/back images there, enter first name **Sandip** and surname **Surela**, and submit both samples with consent. In a separate admin browser profile open **Identity reviews**, inspect the evidence, record a correction or completed human review, then make the separate listing decision. See [verification walkthrough and private-storage setup](docs/PROVIDER-IDENTITY-UPDATE.md). No external OCR key is required.

**Admin-created accounts:** open **Create accounts** in the admin dashboard to prepare a private customer/provider invitation. The recipient finishes verification and registration in a separate browser profile. See [invitation walkthrough](docs/ADMIN-INVITATIONS-UPDATE.md). No invitation message is sent automatically.

**New deposit/payment milestone:** `npm run demo` enables a local simulation with no gateway account or real money. After provider acceptance, the customer opens **Visit deposit & receipt** from their booking, reviews the optional ₹99 amount and can simulate failure/success. Admins use **Payment ledger**. Your own Razorpay Test keys are needed for hosted gateway checkout; live keys are refused. See [payment walkthrough and setup](docs/PAYMENTS-UPDATE.md).

## 1. See the project immediately

1. Install Node.js **22.12 or newer** (an active supported LTS release is recommended).
2. Extract this ZIP. Open the **GharSeva-MERN** folder in VS Code.
3. Open Terminal → New Terminal in that folder.
4. Run:

```powershell
npm ci
npm run demo
```

5. Open **http://localhost:5173**.

The first demo run downloads a MongoDB binary, so it needs internet. It runs a real, temporary MongoDB instance; records disappear when you stop the demo with Ctrl+C. This is useful for practising, but use Atlas below to keep your project records.

| Role     | Email                 | Temporary demo password |
| -------- | --------------------- | ----------------------- |
| Customer | customer@gharseva.com | Customer123             |
| Provider | provider@gharseva.com | Provider123             |
| Admin    | admin@gharseva.com    | Admin12345              |

Seeded provider profiles, photographs and one completed booking/review are fictional demonstration content. The primary demo provider is Rajesh Kumar in Bengaluru. Pick him when demonstrating the provider login workflow.

All twelve provider logins, passwords and alternate mobile logins are in **[DEMO-ACCOUNTS.md](DEMO-ACCOUNTS.md)**. Run `npm.cmd run demo:accounts` to print them. In Windows PowerShell, use `npm.cmd` in the commands below if `npm.ps1` is blocked.

## 2. Connect MongoDB Atlas to save records

Atlas stores your database online. React talks to Express; Express talks to Atlas. Never put your Atlas connection string in React or in a `VITE_` variable.

1. Go to https://www.mongodb.com/cloud/atlas and create/sign in to your account.
2. Create a project named **GharSeva**.
3. Create a **Free** cluster if the free option is offered in your account. Select a nearby region. Wait until it is ready.
4. In **Database Access** (or the cluster's Connect dialog), create a database user. This is separate from your Atlas website login. Give this user read/write access to the **gharseva** database. Save the username and password privately.
5. In **Network Access**, add your current public IP address. If you change networks, update the IP entry. You do not need to open access to every IP address.
6. Open the cluster's **Connect → Drivers** option. Select **Node.js** and copy the connection string. Screen labels may change; MongoDB's current connection guide is linked below.
7. In VS Code, copy **server/.env.example** to **server/.env**. Windows PowerShell command from the root folder:

```powershell
Copy-Item server/.env.example server/.env
```

8. Replace `MONGODB_URI` with your connection string. Insert your database username/password and include `/gharseva` before `?`. URL-encode special characters in the password (for example `@` becomes `%40`). Example with placeholders only:

```dotenv
MONGODB_URI=mongodb+srv://DB_USERNAME:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/gharseva?retryWrites=true&w=majority
```

9. Generate a session secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

10. Paste that output as `JWT_SECRET` in **server/.env**. Leave `NODE_ENV=development` and `CLIENT_ORIGIN=http://localhost:5173` for local work.
11. Choose the three `SEED_*_PASSWORD` values in that file. Their supplied values are demo defaults; change them if you expose the app beyond your classroom.
12. Stop the temporary demo with Ctrl+C, then run:

```powershell
npm run seed
npm run dev
```

13. Open http://localhost:5173. Your records now persist in Atlas.
14. To see records in Atlas, open **Browse Collections / Data Explorer** and select **gharseva**. Collections include users, categories, bookings, reviews, enquiries, files and settings.

`npm run seed` adds sample data only to an empty account database. It never deletes existing accounts or bookings. Do not run this project against an unrelated production database.

Official guidance:

- https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
- https://www.mongodb.com/docs/atlas/connect-to-database-deployment/
- https://vite.dev/guide/

## 3. Use Postman to prove your API works

Postman sends requests to Express and displays the response. It does not replace the database or the frontend.

1. Install/open the Postman desktop app: https://www.postman.com/downloads/.
2. Keep `npm run demo` or `npm run dev` running.
3. Click **Import** and choose **docs/GharSeva.postman_collection.json**.
4. Open the imported collection and its **Variables** tab. `base_url` is `http://localhost:5000/api`.
5. If you changed the Atlas seed passwords, update the collection's `customer_password`, `provider_password`, `admin_password` variables.
6. Send requests in order. The scripts store provider IDs, booking IDs, cookies and the customer visit code automatically.
7. Send **01 Health**. Expected: HTTP 200 and `database: connected`.
8. Continue through discovery and the booking journey. A new booking returns HTTP 201 and `status: PENDING`.
9. The wrong-OTP test returns HTTP 400. The correct OTP allows `IN_PROGRESS`, then the completion request gives `COMPLETED`.
10. Save screenshots of the status codes and Atlas booking record for your submission.

The collection captures separate customer/provider/admin session cookies and disables the collection cookie jar for these requests so roles stay explicit. All write requests include `X-GharSeva: 1` for request verification. A normal API client must include this header too.

If a collection booking returns 409, rerun the availability request or choose another date/time. Repeated reviews of the same booking intentionally return 409.

Official guidance: https://learning.postman.com/docs/getting-started/quick-start/

## 4. A short demonstration for your teacher

1. Explain the stack: React JSX interface, Express routes, Node runtime, MongoDB persistence.
2. Open Home, Services and a provider profile.
3. Open **Service assistant**, describe a household issue and show the suggested category, follow-up questions and actual matching professionals. Explain that guided mode works now; live AI is an optional configured integration. After customer sign-in, choose a time, review the draft and explicitly confirm the request.
4. Use **Compare** on two provider cards, then open the comparison page.
5. Log in as customer. Select the demo provider Rajesh Kumar, choose a future slot and submit a request.
6. Open the customer dashboard; show the Pending booking and its visit OTP.
7. Open a separate browser profile/incognito window as provider. Accept the request → “I'm on the way”.
8. Enter the customer's OTP → start work → complete the service.
9. Refresh the customer dashboard (or wait up to 15 seconds). Leave a review.
10. Log in as admin. Show the same booking, real counts and saved review.
11. Submit a contact message and find it in the admin enquiry inbox.
12. For provider onboarding, register a new provider and attach the sample PDF linked on the registration form (also available as **server/fixtures/demo-document.pdf**). Then log in as admin, open **Providers & approval**, review the document and approve. The profile appears in search after approval. Existing pending accounts can upload in **Photos & documents**; rejected accounts can **Resubmit for review** after correction.
13. Show the same records in Atlas and test an endpoint in Postman.

Use different browser profiles for different roles. Tabs in the same browser profile share the login cookie.

## 5. Build and test

```powershell
npm test
npm run build
```

Tests use a temporary MongoDB database and never connect to your Atlas database. First-time test setup also needs a MongoDB binary download.

To run the built app locally against your configured database:

```powershell
npm run build
npm start
```

Open **http://localhost:5000**. For this mode set `CLIENT_ORIGIN=http://localhost:5000` in server/.env before starting. For the Vite development server, use `http://localhost:5173` instead.

Deploying publicly requires an HTTPS Node host, correct `CLIENT_ORIGIN`, `NODE_ENV=production`, a private secret and an Atlas network entry for that host. Static-only hosting cannot run this Express backend.

## Troubleshooting

- **Cannot connect / backend banner:** check the API terminal. Atlas needs a correct URI, database user and IP access entry. Visit http://localhost:5000/api/health.
- **Authentication failed:** confirm the database user's credentials, not your Atlas website password.
- **DNS / server selection timeout:** check the cluster status, network and IP access entry.
- **Missing session secret:** generate and set JWT_SECRET; do not keep the placeholder.
- **Port already in use:** close the earlier demo or development process. The frontend uses 5173 and the API uses 5000.
- **403 Origin not permitted:** use localhost consistently and match CLIENT_ORIGIN exactly, including port. Restart the backend after editing .env.
- **Provider not listed:** upload a sample document, obtain admin approval, enable its category, keep the account active and refresh.
- **No slots:** pick a future date within 90 days, check working days/times and existing active bookings.
- **OTP locked:** customer uses the refresh-code button; then provider enters the new code.
- **Demo binary download fails:** use Atlas with `npm run dev`, or install local MongoDB and configure `mongodb://127.0.0.1:27017/gharseva` as MONGODB_URI.

See **docs/PROJECT-NOTES.md** for scope, API routes, feature explanations and image sources.
