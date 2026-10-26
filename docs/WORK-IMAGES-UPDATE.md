# Professional work images — 25 October 2026

Implemented in the existing GharSeva-MERN project. No database reset, reseed, migration, ZIP or dependency upgrade was performed.

## Behaviour

- Every one of the 12 seeded professionals has a distinct local sample photograph, assigned by stable demo-provider ID. The two cleaners show window cleaning versus sink/counter cleaning; cooks and electricians also have different source photographs.
- Professional uploads take priority over stock samples in shared cards, service listings, dashboard previews and profile galleries. New server uploads are prepended, while the display helper also handles older arrays where a sample precedes genuine uploads.
- Existing upload/delete access controls remain. Profile portraits remain separate. The updated public API only accepts portfolio-file metadata belonging to that account; identity/supporting documents and another professional's files are excluded.
- Real professionals with no work photos get a neutral local SVG. Failed image loads use the same neutral fallback. No category stock image is substituted for a real person's missing work.
- Samples are labelled “Sample photograph” and have explicit illustrative/not-verified alt text. Uploads are labelled “Professional upload”; this does not assert independent job verification.
- Existing card dimensions remain unchanged. Work photos use object-fit: cover; the modal keeps its existing contain behaviour, and neutral placeholders use contain.

## Existing demo records: no apply command needed

The server presents known legacy demo sample references through a read-only mapping. It recognises the original demo account's exact name/email/mobile/role/category, or an explicit marker from the new empty-database seed. It does not save changes to the account. Real uploads, other profile fields, credentials, approvals, applications, documents, bookings, reviews, prices and payments remain intact.

New empty-database demo seeds store profile.demoProviderId plus the assigned local sample. The existing “skip if accounts exist” protection is preserved and tested.

For an already-running older API that omits the new marker/contact fields, the shared display helper matches the full original fictional public fingerprint: name, category, area, city and exact biography including the explicit college-demo disclaimer. Name or category alone is insufficient. Only known legacy sample references are aliased; actual upload references are retained and prioritised. This compatibility path performs no writes.

Refresh the browser with Ctrl+F5 to pick up the display change. No migration, dry-run/apply data-update script or seed command is needed. On the next normal API restart, the server loads the strengthened file-kind/owner checks and newest-first upload write. Keep the same persistent database and settings:

```powershell
cd C:\workspace\GharSeva-MERN
npm.cmd run dev
```

Do not run seed to update an existing database. If the current launcher is npm run demo, its database is temporary: stopping that launcher discards that demo's memory data. The read-only display compatibility allows the current demo to show distinct samples without requiring that restart.

## Assets and permission

All sample assets are local. Nine existing project photographs were reused and three additional, genuinely different photographs were downloaded from free Unsplash source pages. All 12 source URLs and file contents are distinct, checked by the test suite and visual inspection. JPEG conversion/resizing was for delivery size, not to manufacture different photographs from the same source.

Unsplash license, checked 25 October 2026: https://unsplash.com/license
Original project asset sources remain recorded in PROJECT-NOTES.md. These are illustrative stock images, not identity evidence or verified completed work by a named professional.

| Stable demo ID | Local image under client/public | Subject | Source/credit |
| --- | --- | --- | --- |
| rajesh-kumar | /images/plumbing.jpg | Pipework and plumbing fittings | https://images.unsplash.com/photo-1607472586893-edb57bdc0e39 |
| anita-sharma | /images/cleaning.jpg | Window cleaning | https://images.unsplash.com/photo-1581578731548-c64695cc6952 |
| imran-sheikh | /images/electrical.jpg | Electrical wall installation | https://images.unsplash.com/photo-1621905251189-08b45d6a269e |
| deepak-yadav | /images/carpentry.jpg | Carpentry tools and timber | https://images.unsplash.com/photo-1504148455328-c376907d081c |
| meena-patel | /images/cooking.jpg | Kitchen prepared for cooking | https://images.unsplash.com/photo-1556911220-bff31c812dba |
| suresh-naik | /images/demo-work/suresh-naik.jpg | Open dishwasher and components | Kaede Nakamura: https://unsplash.com/photos/a-machine-with-wires-and-tubes-ZFtJx5nRZ2k |
| ravi-verma | /images/painting.jpg | Paint roller and supplies | https://images.unsplash.com/photo-1562259949-e8e7689d7828 |
| farah-khan | /images/demo-work/farah-khan.jpg | Sink/counter cleaning | everdrop GmbH: https://unsplash.com/photos/a-woman-is-cleaning-a-kitchen-sink-with-a-rag-SqOMDOQb3ws |
| ganesh-more | /images/masonry.jpg | Construction/masonry site | https://images.unsplash.com/photo-1504307651254-35680f356dfd |
| lata-joshi | /images/demo-work/lata-joshi.jpg | Vegetables cooking on a stove | fuseviews: https://unsplash.com/photos/a-pot-filled-with-vegetables-sitting-on-top-of-a-stove-9-nzzhnSBrs |
| vikram-singh | /images/professional.jpg | Electrical equipment repair bench | https://images.unsplash.com/photo-1581092918056-0c4c3acd3789 |
| pooja-desai | /images/gardening.jpg | Potting soil and tools | https://images.unsplash.com/photo-1416879595882-3373a0480b5b |

The neutral work-photo-placeholder.svg is an original simple camera illustration, not a photograph. Runtime images never hotlink to Unsplash. Shell DNS blocked the initial acquisition attempt; browser downloads succeeded, so all required assets are now present locally. No asset acquisition remains outstanding.

## Files changed

Existing source files:
- client/src/components/UI.jsx
- client/src/pages/ProviderDetails.jsx
- client/src/pages/Dashboard.jsx
- client/src/styles.css
- server/src/app.js
- server/src/models.js
- server/src/seed.js

New files:
- shared/work-images.js
- seed-data/demo-work-images.js
- client/src/components/WorkPhoto.jsx
- client/public/images/work-photo-placeholder.svg
- client/public/images/demo-work/farah-khan.jpg
- client/public/images/demo-work/lata-joshi.jpg
- client/public/images/demo-work/suresh-naik.jpg
- server/test/work-images.test.js
- docs/WORK-IMAGES-UPDATE.md

Vite regenerated client/dist. Package files/dependencies were not changed. There is no Git metadata in this working copy; source hashes were compared with a baseline taken before editing. Login.jsx, Login.css, LoginCode.jsx and authentication modules match that baseline byte for byte.

## Verification

Commands:
```powershell
node --test server/test/work-images.test.js server/test/password-login-unit.test.js
npm.cmd run build
```

Results: **23/23 tests passed** (12 work-image checks and 11 existing login checks). **Production build passed**, 1,623 modules transformed.

The focused tests use actual selection/public/upload/delete/seed handlers with mocked database persistence; they do not connect to an existing database. They cover distinct assets and stable IDs, same-category differences, legacy arrays, upload priority, private/foreign-file exclusion, unrelated-record preservation, upload limits/guards, deletion/failure cleanup, read-only legacy compatibility, new seed assignments and skipping existing databases. The existing password-login tests were also run.

Browser checks on the current local application:
- Anita and Farah cleaning cards show different loaded local images.
- Both profile galleries match their card images.
- Desktop cards retained 157px covers; mobile cards retained their existing 210px covers in the observed 360px layout. Profile mobile cropping was inspected.
- A new test upload through the fictional Rajesh provider's Photos & documents UI became the main card image and first gallery image, ahead of the original sample. It was then deleted through the same owner controls. The original sample and supporting document remained, and the demo session was logged out.
- A new asset was temporarily withheld to force a 404. The component changed to /images/work-photo-placeholder.svg with “Work photograph unavailable” alt text. The original asset was restored immediately.
- The working two-step provider login and compact OTP screen were used during this check.

The real MongoDB/HTTP API test was attempted with a 20-second bound:
node --test --test-timeout=20000 server/test/api.test.js
It timed out during database setup in this restricted environment; it is not a passing full API-suite result. The stalled run was interrupted.

The running browser API was an older process, so its public compatibility path and existing upload/delete endpoints were exercised. The updated server's metadata filtering and upload ordering were checked in process with mocked persistence. A full real-MongoDB regression run against the restarted new API remains unverified; no external database migration/update command was executed.

