> Current login contract (25 October 2026): see [LOGIN-TWO-STEP-SETUP.md](LOGIN-TWO-STEP-SETUP.md). Standalone login-code methods described below are superseded by password followed by mandatory registered-email OTP.

# Login page — earlier design milestone

Superseded by [the login requirements completion](LOGIN-REQUIREMENTS-UPDATE.md) on 24 October 2026. The text below records the earlier page-design milestone.

Updated 23 October 2026. This milestone is built from the uploaded GharSeva project, together with the earlier session-security correction. It does not include the later, unuploaded edits made on the user's Windows computer.

## Implemented

- A dedicated React login page with its own scoped stylesheet, a compact white form, teal branding and the existing local home photograph.
- A single-column mobile presentation, compact privacy/support navigation, and a balanced desktop layout.
- Email or mobile number plus password sign-in, including normalisation of +91 Indian numbers in this form.
- Password visibility, Caps Lock feedback, inline validation, first-invalid-field focus, accessible server errors, pending state and duplicate-submit prevention.
- A support disclosure and link, customer registration and provider registration links, safe role-based redirects, and preservation of the intended booking destination when moving to customer registration.
- An administrator entry at `/admin/login`. It uses the same authentication service with an optional `portal: "admin"` request field. The server validates the stored role before issuing an admin-entry session. Existing login requests without this field retain their behaviour.
- A meaningful regression test for administrator entry, bringing the backend suite to 47 tests. The earlier session revocation fix and its three tests remain included.

At the time of this login milestone, registration used the supplied page. The subsequent [customer registration milestone](CUSTOMER-REGISTRATION-UPDATE.md) is now included; the later [complete registration workflow](FULL-REGISTRATION-UPDATE.md) now includes the redesigned professional application and admin request queue. No external authentication credentials are needed to run these password-based pages.

## Checks

The backend suite passed all 47 tests against an isolated temporary MongoDB 7.0.24 database. It covers all three account roles, admin permissions, password/session behaviour, private documents, provider approval, booking conflicts and lifecycle, visit codes and reviews. The React production build passed with Node.js 24.19.0.

Browser layout checks used the actual React page at viewport-frame widths of 320, 360, 390, 768, 1024, 1366 and 1440 pixels. No horizontal document overflow was found; a conventional vertical scrollbar reduces the inner content width by 15 pixels in that test browser. The sign-in button remains visible in the default 768-pixel-tall views. The photograph loaded successfully.

Browser interaction checks covered empty-form validation and focus, password visibility on an empty field, support disclosure, administrator entry and return navigation, and the provider-registration handoff. The original provider form displayed its service selector after that handoff.

The supervised browser environment could not run MongoDB. Browser visual/component checks therefore used isolated API fixtures, while real authentication, session and booking integration checks ran separately through the backend suite and MongoDB. No successful browser credential-to-dashboard journey is claimed for this milestone. The development-only visual harness and its fixtures are excluded from the saved project. No Windows or live external-provider tests were performed.

## Run the supplied project

From the extracted project root in PowerShell:

```powershell
npm.cmd ci
npm.cmd run demo
```

Open `http://localhost:5173/login`. Administrator entry is `http://localhost:5173/admin/login`. The normal demo accounts and passwords remain documented in `DEMO-ACCOUNTS.md`. Temporary demo records reset when the demo stops. Use the Atlas instructions in `START-HERE.md` when persistence is required.

For the production bundle, run `npm.cmd run build` and use the existing `npm.cmd start` flow with the configured MongoDB connection and origin. No dependency changes were required for this milestone.

## Files

- `client/src/pages/Login.jsx` and `Login.css`: new page and scoped presentation.
- `client/src/App.jsx`: login/admin routes and compact authentication-page chrome.
- `client/src/pages/Auth.jsx`: exposes the existing destination helper; the original registration interface is retained.
- `server/src/app.js`: validates administrator-entry requests before session creation.
- `server/test/api.test.js`: administrator-entry regression coverage.
- README and verification documentation: current status and checks.

## Remaining integrations

Google, Apple, SMS/email OTP and automated password recovery are not connected in this uploaded source. They are later milestones requiring the relevant account configuration. The current Need help action links to the existing support form; it does not pretend to send password-reset codes. Supporting document upload remains manual review rather than real Aadhaar verification.
