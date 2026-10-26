# Customer registration — earlier page milestone

Superseded by [the complete registration workflow](FULL-REGISTRATION-UPDATE.md). The text below records the earlier page-only update.

Updated 23 October 2026, continuing the login redesign in the supplied project.

## What changed

- `/register` now uses a dedicated React customer registration page. It matches the login page's teal branding, local home photograph, white card, spacing and compact footer.
- Four required fields: full name, email, Indian mobile number and password. Service addresses are collected during booking. The existing backend's default account city remains unchanged; this milestone does not change the account schema.
- Password-manager support through `autocomplete="new-password"`; live password requirements, show/hide control and Caps Lock feedback. Password generation/suggestion remains the browser or password manager's choice and is not guaranteed on every device.
- Mobile entry accepts a ten-digit number, a spaced number or a pasted +91 prefix; the form sends the normalised ten-digit value to the existing API. The +91 label does not send an OTP.
- Explicit terms/privacy agreement, links opening in a separate tab so the form stays in place, inline errors, first-invalid-field focus, focused server errors, a pending state and duplicate-submit prevention.
- Customer registration uses the real `/api/auth/register` endpoint, establishes the existing HttpOnly session and preserves the requested booking destination. Role is fixed to `customer`; no administrator registration is exposed.
- Provider applications remain available at `/register?role=provider`, retaining the existing required-document and administrator-review behaviour. Switching back to customer registration opens the new page.
- All changes from the login milestone and earlier session-security fix remain included. No dependencies were added.

## Checks

`npm test`: **50 passed, 0 failed**, against temporary MongoDB 7.0.24. Three new customer registration tests cover the four-field API payload, password hashing, usable sessions, email/mobile password login, duplicate-contact rejection and invalid registrations creating no accounts. They also verify that an injected verification flag is not trusted. The previous 47 authentication, permissions, document, approval, booking and review tests pass unchanged.

`npm run build`: passed with Node.js 24.19.0.

The actual React page was checked in browser viewport frames at widths 320, 360, 390, 768, 1024, 1366 and 1440 pixels. No horizontal document overflow was found; vertical scrollbars reduce the inner width by 15 pixels in this browser. Desktop and mobile layouts and local image loading were visually inspected. Empty-form validation, first-field focus, empty-password visibility, provider/customer switching, login and return-to-registration navigation passed browser checks.

The supervised visual preview used isolated API fixtures because MongoDB cannot run there. Real registration, sessions and duplicate/invalid submissions were tested separately through the actual Express API and MongoDB, not through a completed browser signup. Browser-generated password suggestions, a full browser signup-to-dashboard journey, Windows and other browsers were not tested. Temporary preview scripts and fixtures are excluded from this archive.

## Review on Windows

Extract the complete ZIP into a new folder. In PowerShell, open the extracted `GharSeva-MERN` folder and run:

```powershell
npm.cmd ci
npm.cmd run demo
```

Open `http://localhost:5173/register`. Existing sign-in pages are `/login` and `/admin/login`. See `DEMO-ACCOUNTS.md` for sample accounts. Demo database records reset when the demo stops; use `START-HERE.md` for persistent MongoDB setup.

## Still pending

Google and Apple sign-in, SMS/email OTP, verified-contact onboarding and automated password recovery are not connected. Email and mobile are both required by the existing API; moving to one verified primary contact requires the planned schema and identity-provider integration. This page never labels an entered contact as verified.

The next milestone is the provider application redesign: multiple service categories, a clear step-by-step flow, explicitly opted-in saved drafts and a separate follow-up permission. Saved drafts and the admin application queue are not implemented by this customer-page milestone.

## Changed files

- `client/src/pages/CustomerRegister.jsx` and `CustomerRegister.css`
- `client/src/App.jsx`: registration route and compact footer selection
- `client/src/pages/Auth.jsx`: provider-to-customer navigation
- `server/test/customer-registration.test.js`: real API contract checks
- README and status documentation
