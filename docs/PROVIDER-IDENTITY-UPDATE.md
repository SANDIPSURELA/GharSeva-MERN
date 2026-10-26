# Provider identity document review — 24 October 2026

This accumulating project includes all earlier login, password recovery, verified registration, saved applications, admin queue and customer assistant work. This milestone implements **assisted document review**, not UIDAI Aadhaar authentication or automatic provider selection.

## What changed

Provider dashboard → **Identity verification** now offers a dedicated styled workflow: name details, document type, front/back previews, separate consent, local OCR output, private evidence and a review timeline. Admin dashboard → **Identity reviews** has a status-filtered, paginated queue, original image previews, entered/extracted/registration names and recorded manual decisions. Application cards and the older Providers & approval panel link to the private evidence.

The new provider registration page creates its existing pending account/application, then opens this private verification step. Its qualification/supporting document remains separate. New registrations from that page require identity document review before listing approval; production enforces the requirement for every new provider registration. `REQUIRE_PROVIDER_IDENTITY=true` also enforces it for new local API registrations. Existing providers retain their previous approvals and records; they are not silently migrated or required to re-register. If an existing provider voluntarily submits verification evidence, future listing-approval attempts require its current manual review too. Existing bookings and approved listings are not automatically cancelled or demoted by OCR, evidence replacement, removal or expiry.

## Name checking

The server runs Tesseract English OCR locally, then applies deterministic name-component comparisons. No document image or raw OCR text is sent to OpenAI, Firebase or an external OCR service. The customer chatbot is a separate integration.

| Entered name  | Document name          | Assisted result                                                                              |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Sandip Surela | Surela Sandip Rajubhai | Components consistent; reordered names and the additional “Rajubhai” component are explained |
| Sandip Surela | SANDIP SURELA          | Components consistent after formatting                                                       |
| Sandip Surela | Sandeep Surela         | Review the missing component and possible spelling difference                                |
| S. Surela     | Sandip Surela          | Initial needs human review                                                                   |
| Sandip Surela | Unreadable text        | Request clearer evidence or review manually                                                  |
| Sandip Surela | Other Person           | Flag a discrepancy; no automatic rejection                                                   |

The entered name is also compared with the registration name through the extracted document name, so changing the typed verification fields cannot hide an account-name discrepancy. A registration-name change after submission prevents a completed review until the applicant makes a fresh submission.

The parser prioritises a labelled primary name on the **front**, excludes obvious relative/address/document headings and avoids selecting among ambiguous unlabelled lines. Low OCR confidence, initials, single-part names, spelling differences and non-English script require manual attention. It does not infer caste, religion, background, suitability, qualifications or trustworthiness. It does not train a custom model on applicant documents or assign a probability that two people are the same.

A consistent name is only a clerical result. It cannot prove that a card is genuine or belongs to the uploader. A trained OCR engine can still read the wrong line or miss text. Administrators inspect the original evidence, record the name they read, acknowledge their own review and give a reason. They can request a correction without completing the review. Finishing document review does **not** publish the listing; the separate application decision still belongs to the administrator.

## Classroom walkthrough

1. Extract the latest ZIP and open its `GharSeva-MERN` folder. Use Node.js 22.12+.
2. Run `npm ci`, then `npm run demo`. Open http://localhost:5173. The first MongoDB binary download needs internet; use persistent MongoDB/Atlas for retained records.
3. Sign in as an included demo provider using DEMO-ACCOUNTS.md. Open **Identity verification**. Existing demo accounts remain usable.
4. Download **sample front** and **sample back** from the form. They are clearly labelled software fixtures, contain no identity number, address or biometric information, and are not valid ID.
5. Enter first/given name **Sandip**, leave middle name empty, and enter surname **Surela**. Select **Masked Aadhaar — front and back** for demonstrating the two-sided upload controls. Upload the fictional samples, acknowledge the masking/sample statement and give processing/retention consent.
6. Submit and wait for local OCR. It should read **Surela Sandip Rajubhai**. The entered name components are consistent. The existing demo provider may have a different registration name: that difference correctly sends the overall check to review. To show the fully consistent example, use a fictional pending account registered as Sandip Surela. No actual Aadhaar is needed.
7. In a separate browser profile, sign in as admin → **Identity reviews**. Open the submission. Inspect both samples, the registration/entered/extracted names and the explanation.
8. Write clear correction instructions and click **Request a correction**. The provider sees the review history and can replace the evidence; replacement starts a fresh review revision.
9. After inspecting corrected fictional evidence, enter the name you read, give a review reason and tick the personal-review acknowledgement. Click **Record completed review**. The listing remains pending.
10. Continue to **Registration requests** or **Providers & approval** to make the separate listing decision. Both backend approval routes enforce the current document review for accounts that require it. A qualification/supporting document is still required too.
11. Providers can replace or remove retained verification images. Replacing resets the document review; removing withdraws evidence. Old files are deleted after successful replacement/removal; audit history remains.

Use separate browser profiles for provider/admin roles; tabs in the same profile share authentication cookies. The temporary demo resets its database when stopped. Do not use real identity documents in a classroom demo.

## Installation and private storage

`npm ci` installs the locked `tesseract.js`, `@tesseract.js-data/eng` and `sharp` packages. English language data is installed locally with the package. OCR does not download an image to a third-party service and needs no OCR API key. The server decodes JPG/PNG/WebP images, strips metadata by re-encoding, and processes up to two images. Each input is limited to 3 MB, at least 500 × 300 pixels, single-frame and at most 12 million decoded pixels. Processed dimensions are bounded. PDF is still supported for the separate qualification document, but not this image-reading step.

For persistent local use or production, configure **server/.env**:

```dotenv
IDENTITY_STORAGE_KEY=YOUR_64_HEX_CHARACTER_SECRET
REQUIRE_PROVIDER_IDENTITY=true
```

Generate a random key locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `server/.env` or the host's secret settings. Keep it private and stable; never put it in React, a `VITE_` variable, chat, source control or the ZIP. The file contains placeholders only. Production refuses image storage without a valid 32-byte hex key. Development with an empty key derives a local encryption key from the session secret; changing that secret makes those old local images unreadable. The temporary demo uses a random session secret and disposable database. Set a dedicated stable key before retaining real project records. Backups require the corresponding secret to decrypt images; key rotation/migration is not automated in this version.

Images use AES-256-GCM before MongoDB storage. They are exposed only through authenticated owner/admin endpoints with no-store headers; the old public file route cannot serve them. Uploaded filenames, raw OCR text, full identity numbers and extracted address/DOB fields are not saved as structured verification data. The application retains necessary name comparisons, consent time, revision and review history. The **new verification images** have this encryption; this does not migrate the project's older supporting-document collection to encryption.

Evidence expires after 30 days. MongoDB's TTL cleanup removes expired image records in the background; access is denied at expiry even before cleanup runs. Review records/history remain. Confirm TTL indexes are present when deploying with automatic index creation disabled. Removing or replacing evidence deletes the old retained image records; a successful replacement cannot reuse a stale human review. The same stable key is needed across server instances.

The OCR reader permits one active job per server process, with a 40-second timeout. Uploads are limited to eight attempts per 15 minutes/IP in that process. Busy/failed jobs return an error and retain no new images. Multi-instance distributed limits/queues and background OCR jobs are future scaling work.

## Aadhaar boundary and privacy

Masked Aadhaar requires both sides and an explicit acknowledgement that the uploader is using fictional evidence or has masked the number except its last four digits and covered unnecessary private details. Alternative evidence is available; it can use one side. A detected full 12-digit number on either OCR result refuses the upload before new image storage. **This is a limited detector, not guaranteed redaction.** Prepare masked copies before upload; the system cannot ensure that every number, QR code, address or other private detail has been covered. It does not automatically redact a photograph or certify that it is safe to retain.

Live Aadhaar verification is not connected. The system does not validate UIDAI digital signatures, retrieve government records, send Aadhaar OTPs, compare faces or use biometrics. Before real public use, complete the appropriate consent, permissible verification/integration and document-handling setup. UIDAI describes signed QR/offline verification and consent-based information sharing; a photographed card/name comparison cannot substitute for that integration.

Official references:

- https://www.pib.gov.in/PressReleasePage.aspx?PRID=2253755&lang=1&reg=1
- https://www.pib.gov.in/PressReleasePage.aspx?PRID=1889996
- https://github.com/naptha/tesseract.js/blob/master/docs/api.md
- https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md

## Verification

**112 backend tests pass**, with 23 added verification tests and all previous 89 checks. The new suite uses Express and temporary MongoDB for actual permissions, encryption, name comparisons, consent, detected-number refusal, expiry, replacement/removal, revision conflicts, reviewer concurrency, approval locks, both existing approval entries, production key refusal, registration enforcement and profile-edit bypass prevention. A real Tesseract run reads the fictional sample; other API cases inject deterministic OCR output to exercise specific failure conditions. This is not an OCR accuracy benchmark across genuine identity documents.

The React production build passes. Browser checks use isolated fictional API fixtures and the actual local reader for sample upload, covering front/back selection, preview, assisted output, correction and completed-review controls, pending listing status, and narrow-screen alternative evidence. Provider/admin layouts pass at 320, 390, 768, 1024 and 1440 pixels without horizontal document overflow. Real session/database authorization is checked separately by the API suite. No real Aadhaar image was used, no external OCR/model service called, no actual applicant approved and no public site deployed. Windows/other browsers, blurry-photo OCR performance, live UIDAI integration, production storage backups and hosting remain unverified or separate milestones.

## Main files

- `client/src/pages/IdentityVerification.jsx` and `.css`: provider workflow, local previews, name result and admin queue/review.
- `client/src/pages/ProviderRegister.jsx`, `Dashboard.jsx`, `Applications.jsx`: onboarding and dashboard links.
- `server/src/identity-ocr.js`: bounded local image decoding and OCR.
- `server/src/identity-name-check.js`: conservative name extraction and comparison.
- `server/src/provider-identity.js`: encrypted storage, private access, consent, review revisions and approval guard.
- `server/src/models.js`: identity record and expiring encrypted file metadata.
- `server/src/app.js`, `registration.js`: registration requirement and both existing approval routes.
- `server/test/provider-identity.test.js`: 23 new checks.
- `client/public/demo/identity-front.png` and `identity-back.png`: clearly labelled fictional software fixtures.
