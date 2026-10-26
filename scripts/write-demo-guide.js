import { writeFileSync } from "node:fs";
import { accountRows } from "../scripts/demo-account-guide.js";
const rows = accountRows();
const table = (headers, rows) =>
  "| " +
  headers.join(" | ") +
  " |\n| " +
  headers.map(() => "---").join(" | ") +
  " |\n" +
  rows.map((r) => "| " + r.join(" | ") + " |").join("\n");
const guide = `# GharSeva classroom demo accounts

This is the fictional account catalogue used by the seed, expansion and terminal list. It is not a report of accounts currently present in your persistent database. Temporary classroom passwords below apply to a fresh \`npm.cmd run demo\` session. Login accepts email OR mobile, followed by the password and email OTP for every role, including admin.

## Start a fresh temporary classroom

\`\`\`powershell
Set-Location C:\\workspace\\GharSeva-MERN
npm.cmd run demo
\`\`\`

Open http://localhost:5173. This command prints every account below, enables explicit classroom OTP delivery and simulated payments, and creates an isolated temporary database. Stop with Ctrl+C. Its records disappear; it does not expand or reset your existing database. Do not run dev and demo on the same ports at the same time.

## Add missing accounts to the existing development database

Keep the existing MONGODB_URI in server/.env (or your process environment). Set SEED_PROVIDER_PASSWORD for any missing providers. If customer/admin are missing too, set SEED_CUSTOMER_PASSWORD and SEED_ADMIN_PASSWORD. These values are for newly created accounts only. No existing password is changed. Then:

\`\`\`powershell
npm.cmd run demo:expand -- --dry-run
# These apply ONLY to missing fictional accounts. Existing passwords stay unchanged.
$env:SEED_PROVIDER_PASSWORD = 'Provider123'
$env:SEED_CUSTOMER_PASSWORD = 'Customer123'
$env:SEED_ADMIN_PASSWORD = 'Admin12345'
npm.cmd run demo:expand -- --apply
npm.cmd run demo:accounts
npm.cmd run dev
\`\`\`

Expansion defaults to dry-run. Read the printed database name before applying. Missing service categories are added from the existing catalogue; existing category settings, including disabled categories, are retained. No demo expansion runs during production startup, and the command refuses NODE_ENV=production.

Existing accounts: **no fields change**. There is no relocation, city rewrite, password reset, contact verification update, approval change, photo replacement or schedule update. Exact known demo fingerprints are reported KEEP; collisions are reported CONFLICT and preserved. Stable IDs, unique email/mobile and repeat checks prevent repeat creation. New fictional providers receive account/profile city, category, starting price, APPROVED status, active availability, all seven weekdays, 09:00/11:00/14:00/16:00 slots and a private fictional supporting PDF. A future slot remains subject to real booking conflicts. Existing photos, bookings, reviews and applications remain intact.

There are 32 fictional providers: 20 Ahmedabad professionals (two per existing service category) and 12 in Bengaluru/Mumbai/Pune. The old twelve keep their distinct sample photographs. The newly added accounts use the honest work-photo placeholder until public work images are uploaded; no private verification image becomes a public photo. All demo biographies identify the profile as fictional sample content.

## Customer and administrator — temporary passwords

${table(
  ["Name / role", "City", "Login email", "Login mobile", "Temporary password"],
  rows
    .filter((r) => ["customer", "admin"].includes(r.Service))
    .map((r) => [
      r.Name + " / " + r.Service,
      r.City,
      r.Email,
      r.Mobile,
      r["Temporary demo password"],
    ]),
)}

## Every provider — temporary passwords

${table(
  [
    "Displayed name",
    "Service",
    "City",
    "Login email",
    "Login mobile",
    "Temporary password",
  ],
  rows
    .filter((r) => !["customer", "admin"].includes(r.Service))
    .map((r) => [
      r.Name,
      r.Service,
      r.City,
      r.Email,
      r.Mobile,
      r["Temporary demo password"],
    ]),
)}

## Persistent accounts and password changes

Persistent accounts use the password selected when each account was created, or its later changed password. SEED_*_PASSWORD does not reset existing credentials. Provider123 is not a promise about an existing account. The list never reads stored hashes or claims to recover passwords. Use your known password or the existing recovery process. A changed email/mobile also changes the login identifier; conflicts in expansion must be reviewed rather than overwritten.

The login pages are /login, /customer/login, /provider/login and /admin/login. They retain the shared password-plus-email-OTP flow; the server determines role. In explicit classroom mode (AUTH_DELIVERY_MODE=test, GHARSEVA_DEMO=true, non-production), the OTP screen displays the current code. Enter that code; no email/SMS is sent. Codes still expire and must be verified. Production forbids classroom authentication and must use configured live delivery; there are no displayed production OTPs. Visit OTP is separate and appears privately in the customer's booking dashboard.

## Saved cities

Both registration forms require a supported city. The server normalizes case/whitespace and Ahemdabad to Ahmedabad. Real customers receive no automatic Ahmedabad assignment. Existing saved cities are retained. A user without a city must select and save once before continuing. Home discovery, professional listings, assistant and booking use one selected city. Change city changes browsing; Save as my default city explicitly persists it. Comparing professionals, selected assistant provider, locality, time and prepared booking details are cleared when city changes. The full service address is still required.

## List and regenerate this guide

\`\`\`powershell
npm.cmd run demo:accounts
npm.cmd run demo:accounts -- --write
\`\`\`

The second command regenerates this guide and DEMO-ACCOUNTS.csv from the same account definitions as the seed. Credentials are terminal/local documentation only. See DEMO_WALKTHROUGH.md for the real PENDING → ACCEPTED booking demonstration and deposit/visit OTP/final balance steps.
`;
writeFileSync(new URL("../DEMO_ACCOUNTS.md", import.meta.url), guide);
writeFileSync(
  new URL("../DEMO-ACCOUNTS.md", import.meta.url),
  "# Demo accounts\n\nThe complete, generated account guide is [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md). The classroom booking steps are in [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md).\n",
);
const keys = Object.keys(rows[0]);
writeFileSync(
  new URL("../DEMO-ACCOUNTS.csv", import.meta.url),
  "\ufeff" +
    [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((r) =>
        r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n") +
    "\r\n",
);
console.log(
  "Updated DEMO_ACCOUNTS.md and DEMO-ACCOUNTS.csv from the demo catalogue.",
);
