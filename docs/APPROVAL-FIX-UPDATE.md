# Provider registration and approval fix — 22 October 2026

## What caused the blocked approval

The previous registration form created a provider account without a supporting document. The administrator's approval action required a document, but the provider had to discover a separate upload section afterward. The provider dashboard also did not refresh its account's approval state during normal data refreshes.

## Changes

- Provider registration now includes a required supporting PDF or image, uploaded with the account details in one request. The backend checks the actual file signature and size before creating the account.
- Invalid files, missing documents, excessive file size and duplicate accounts return useful errors. A duplicate registration does not leave an unused document behind.
- The registration and Photos & documents screens link to a fictional classroom sample PDF. Existing pending providers can still log in and upload it without recreating their accounts.
- The administrator sees why approval is unavailable when a document is missing. Once uploaded, the document can be downloaded/reviewed and the profile approved.
- Approval checks that the stored document actually exists and belongs to that provider. Documents remain private to their owner and the administrator.
- Rejected providers can correct their details/documents and explicitly Resubmit for review.
- Approved profiles must keep at least one supporting document. Upload a replacement before removing the last one.
- Provider dashboards refresh their account state, so an administrator's decision appears without logging out.
- Private image downloads retain the correct PNG/WebP/JPG extension. File-size errors explain the permitted limit.
- The service finder starts with All listed cities, so a default city with no demo providers no longer hides the available professionals.
- Demo account definitions are shared with the seed, all twelve logins are documented, and `npm.cmd run demo:accounts` prints the list.

## Apply the full update to your existing Windows project

This update changes both frontend and backend. Apply the whole project update.

1. Back up your current source code, including any changes made separately in Codex.
2. Stop the running project with Ctrl+C. If Windows asks about terminating the batch job, enter Y. Stopping temporary demo mode resets its records as before.
3. Extract the new ZIP into a separate temporary folder.
4. Copy the **contents** of its `GharSeva-MERN` folder into your existing `Z:\SEM 6\Xampp\htdocs\GharSeva-MERN` folder. Merge folders and replace the supplied files. The ZIP excludes `node_modules` and personal `.env` files, so your installed packages and database configuration stay in place. Review overlaps before replacing files you independently changed in Codex.
5. Open the original project folder in VS Code and run:

```powershell
npm.cmd run demo
```

6. Open http://localhost:5173 and press Ctrl+F5. Use `DEMO-ACCOUNTS.md` for logins and the faculty demonstration sequence.

Dependencies are unchanged; an existing installation does not require npm ci again. If installing into a completely new folder, run `npm.cmd ci` once before starting the demo.

For a configured persistent database, use `npm.cmd run dev` instead. Existing pending accounts do not need deleting or reseeding: log in as the provider, upload a document and review it as administrator. The code update preserves existing database records. Newly seeded demo passwords do not replace existing passwords.

## Verification

The backend integration suite includes registration with a document, missing/invalid/oversized files, duplicate-account cleanup, private file access, owner validation, rejected-profile resubmission, safe document replacement and recovery of an existing pending account.

Browser verification covers every seeded provider login, actual registration/upload, private document download, administrator approval, automatic provider status refresh, rejection/resubmission and the existing missing-document recovery path. Responsive checks cover narrow mobile and desktop layouts. The existing complete booking journey and API collection are also checked after the changes. Final results are recorded in `VERIFICATION.md`.
