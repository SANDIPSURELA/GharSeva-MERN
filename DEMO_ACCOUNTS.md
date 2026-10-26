# GharSeva classroom demo accounts

This is the fictional account catalogue used by the seed, expansion and terminal list. It is not a report of accounts currently present in your persistent database. Temporary classroom passwords below apply to a fresh `npm.cmd run demo` session. Login accepts email OR mobile, followed by the password and email OTP for every role, including admin.

## Start a fresh temporary classroom

```powershell
Set-Location C:\workspace\GharSeva-MERN
npm.cmd run demo
```

Open http://localhost:5173. This command prints every account below, enables explicit classroom OTP delivery and simulated payments, and creates an isolated temporary database. Stop with Ctrl+C. Its records disappear; it does not expand or reset your existing database. Do not run dev and demo on the same ports at the same time.

## Add missing accounts to the existing development database

Keep the existing MONGODB_URI in server/.env (or your process environment). Set SEED_PROVIDER_PASSWORD for any missing providers. If customer/admin are missing too, set SEED_CUSTOMER_PASSWORD and SEED_ADMIN_PASSWORD. These values are for newly created accounts only. No existing password is changed. Then:

```powershell
npm.cmd run demo:expand -- --dry-run
# These apply ONLY to missing fictional accounts. Existing passwords stay unchanged.
$env:SEED_PROVIDER_PASSWORD = 'Provider123'
$env:SEED_CUSTOMER_PASSWORD = 'Customer123'
$env:SEED_ADMIN_PASSWORD = 'Admin12345'
npm.cmd run demo:expand -- --apply
npm.cmd run demo:accounts
npm.cmd run dev
```

Expansion defaults to dry-run. Read the printed database name before applying. Missing service categories are added from the existing catalogue; existing category settings, including disabled categories, are retained. No demo expansion runs during production startup, and the command refuses NODE_ENV=production.

Existing accounts: **no fields change**. There is no relocation, city rewrite, password reset, contact verification update, approval change, photo replacement or schedule update. Exact known demo fingerprints are reported KEEP; collisions are reported CONFLICT and preserved. Stable IDs, unique email/mobile and repeat checks prevent repeat creation. New fictional providers receive account/profile city, category, starting price, APPROVED status, active availability, all seven weekdays, 09:00/11:00/14:00/16:00 slots and a private fictional supporting PDF. A future slot remains subject to real booking conflicts. Existing photos, bookings, reviews and applications remain intact.

There are 32 fictional providers: 20 Ahmedabad professionals (two per existing service category) and 12 in Bengaluru/Mumbai/Pune. The old twelve keep their distinct sample photographs. The newly added accounts use the honest work-photo placeholder until public work images are uploaded; no private verification image becomes a public photo. All demo biographies identify the profile as fictional sample content.

## Customer and administrator — temporary passwords

| Name / role | City | Login email | Login mobile | Temporary password |
| --- | --- | --- | --- | --- |
| Demo Customer / customer | Ahmedabad | customer@gharseva.com | 9876500001 | Customer123 |
| Project Administrator / admin | Ahmedabad | admin@gharseva.com | 9876500003 | Admin12345 |

## Every provider — temporary passwords

| Displayed name | Service | City | Login email | Login mobile | Temporary password |
| --- | --- | --- | --- | --- | --- |
| Rajesh Kumar | Plumbing | Bengaluru | provider@gharseva.com | 9876500002 | Provider123 |
| Anita Sharma | Home Cleaning | Bengaluru | provider2@example.com | 9876510001 | Provider123 |
| Imran Sheikh | Electrical | Bengaluru | provider3@example.com | 9876510002 | Provider123 |
| Deepak Yadav | Carpentry | Bengaluru | provider4@example.com | 9876510003 | Provider123 |
| Meena Patel | Cooking | Bengaluru | provider5@example.com | 9876510004 | Provider123 |
| Suresh Naik | Appliance Repair | Bengaluru | provider6@example.com | 9876510005 | Provider123 |
| Ravi Verma | Painting | Mumbai | provider7@example.com | 9876510006 | Provider123 |
| Farah Khan | Home Cleaning | Mumbai | provider8@example.com | 9876510007 | Provider123 |
| Ganesh More | Mason Work | Mumbai | provider9@example.com | 9876510008 | Provider123 |
| Lata Joshi | Cooking | Pune | provider10@example.com | 9876510009 | Provider123 |
| Vikram Singh | Electrical | Pune | provider11@example.com | 9876510010 | Provider123 |
| Pooja Desai | Gardening | Pune | provider12@example.com | 9876510011 | Provider123 |
| Kiran Patel | Plumbing | Ahmedabad | ahm.plumbing1@example.com | 9876520001 | Provider123 |
| Nilesh Shah | Plumbing | Ahmedabad | ahm.plumbing2@example.com | 9876520002 | Provider123 |
| Harsh Mehta | Electrical | Ahmedabad | ahm.electrical1@example.com | 9876520003 | Provider123 |
| Jayesh Parmar | Electrical | Ahmedabad | ahm.electrical2@example.com | 9876520004 | Provider123 |
| Kavita Trivedi | Home Cleaning | Ahmedabad | ahm.cleaning1@example.com | 9876520005 | Provider123 |
| Bhavna Joshi | Home Cleaning | Ahmedabad | ahm.cleaning2@example.com | 9876520006 | Provider123 |
| Hetal Vyas | Cooking | Ahmedabad | ahm.cooking1@example.com | 9876520007 | Provider123 |
| Mansi Dave | Cooking | Ahmedabad | ahm.cooking2@example.com | 9876520008 | Provider123 |
| Chirag Suthar | Carpentry | Ahmedabad | ahm.carpentry1@example.com | 9876520009 | Provider123 |
| Paresh Panchal | Carpentry | Ahmedabad | ahm.carpentry2@example.com | 9876520010 | Provider123 |
| Mukesh Prajapati | Mason Work | Ahmedabad | ahm.masonry1@example.com | 9876520011 | Provider123 |
| Dinesh Rathod | Mason Work | Ahmedabad | ahm.masonry2@example.com | 9876520012 | Provider123 |
| Jignesh Solanki | Painting | Ahmedabad | ahm.painting1@example.com | 9876520013 | Provider123 |
| Rakesh Chauhan | Painting | Ahmedabad | ahm.painting2@example.com | 9876520014 | Provider123 |
| Amit Makwana | Labour Assistance | Ahmedabad | ahm.labour1@example.com | 9876520015 | Provider123 |
| Bharat Thakor | Labour Assistance | Ahmedabad | ahm.labour2@example.com | 9876520016 | Provider123 |
| Dhaval Desai | Appliance Repair | Ahmedabad | ahm.appliance1@example.com | 9876520017 | Provider123 |
| Pratik Modi | Appliance Repair | Ahmedabad | ahm.appliance2@example.com | 9876520018 | Provider123 |
| Hiren Mali | Gardening | Ahmedabad | ahm.gardening1@example.com | 9876520019 | Provider123 |
| Sanjay Vaghela | Gardening | Ahmedabad | ahm.gardening2@example.com | 9876520020 | Provider123 |

## Persistent accounts and password changes

Persistent accounts use the password selected when each account was created, or its later changed password. SEED_*_PASSWORD does not reset existing credentials. Provider123 is not a promise about an existing account. The list never reads stored hashes or claims to recover passwords. Use your known password or the existing recovery process. A changed email/mobile also changes the login identifier; conflicts in expansion must be reviewed rather than overwritten.

The login pages are /login, /customer/login, /provider/login and /admin/login. They retain the shared password-plus-email-OTP flow; the server determines role. In explicit classroom mode (AUTH_DELIVERY_MODE=test, GHARSEVA_DEMO=true, non-production), the OTP screen displays the current code. Enter that code; no email/SMS is sent. Codes still expire and must be verified. Production forbids classroom authentication and must use configured live delivery; there are no displayed production OTPs. Visit OTP is separate and appears privately in the customer's booking dashboard.

## Saved cities

Both registration forms require a supported city. The server normalizes case/whitespace and Ahemdabad to Ahmedabad. Real customers receive no automatic Ahmedabad assignment. Existing saved cities are retained. A user without a city must select and save once before continuing. Home discovery, professional listings, assistant and booking use one selected city. Change city changes browsing; Save as my default city explicitly persists it. Comparing professionals, selected assistant provider, locality, time and prepared booking details are cleared when city changes. The full service address is still required.

## List and regenerate this guide

```powershell
npm.cmd run demo:accounts
npm.cmd run demo:accounts -- --write
```

The second command regenerates this guide and DEMO-ACCOUNTS.csv from the same account definitions as the seed. Credentials are terminal/local documentation only. See DEMO_WALKTHROUGH.md for the real PENDING → ACCEPTED booking demonstration and deposit/visit OTP/final balance steps.
