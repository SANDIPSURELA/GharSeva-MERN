# Admin account invitations — 24 October 2026

Admin dashboard → **Create accounts** now creates invitations for customer or provider accounts. No active account is created until the intended recipient verifies their contact, chooses their password, agrees to the terms and completes registration. Administrators cannot invite administrators, set readable passwords, overwrite an existing account or bypass provider approval.

## Use it

1. Run `npm ci` and `npm run demo`, or use your configured persistent development server. Sign in as the demo admin.
2. Open **Create accounts**. Choose Customer or Professional; enter the intended recipient's email or Indian mobile number, optional name and city.
3. Click **Create private invitation**. Copy the link shown this time only and share it privately with that recipient. The app sends no invitation email or SMS automatically.
4. Open that complete link in a separate, signed-out browser profile. The public preview masks the contact and fixes the intended account role. Verify the exact contact by the existing email/mobile code flow. Classroom mode displays clearly labelled demo codes and sends no messages; real delivery needs SMTP or Twilio setup.
5. The recipient chooses their own password and completes the existing customer or professional registration page. The admin sees **Account created** after acceptance. Providers still supply their services and qualification document, then complete private identity review and the separate listing decision.
6. **Replace link** invalidates the previous unused token and starts a fresh 48-hour window. **Revoke invitation** stops an unused invitation without changing any account. Accepted invitations cannot change an account or revoke its sessions.

The original pending application queue, saved drafts, contact verification, identity review, role permissions and bookings remain included. Existing users should sign in to their current accounts rather than accept a new invitation for the same contact. Pausing provider registration also blocks provider-invitation creation/acceptance.

## Security and data handling

Tokens contain 32 random bytes. The database stores their SHA-256 hashes, not recoverable links. A raw link is returned once to the administrator and remains only in that page's memory; it is excluded from subsequent list responses. Invite tokens are not passwords, but should still be shared privately. The recipient link uses a URL fragment so it is not sent in the initial page URL or referrer. The page clears the fragment and keeps the token in memory, so reloading requires reopening the original complete link. Do not screenshot, log or publish invitation links.

A link alone cannot create an account: the server requires a valid registration proof for the exact invited email/mobile and the fixed role. Expired, replaced, revoked and accepted links cannot be reused. Competing acceptances claim the invitation atomically; duplicate account contacts remain protected by the existing unique indexes. Caught creation failures release the claim. A claim left by a process interruption is reconciled after ten minutes: an already-created reserved account is retained and linked, while a claim with no created account can be reopened. An administrator's list refresh performs this recovery; this is not a distributed transaction across every registration record.

Invitation records retain the intended contact, optional name/city, creator, status, revisions, timestamps and action history for up to 90 days after their last lifecycle start/acceptance. MongoDB background TTL cleanup removes the record later; accepted account/application history is separate. No password or contact-verification code is stored in an invitation. Invitation creation sends no communication. The recipient explicitly requests the existing verification email/SMS during acceptance. Configure that delivery as described in REGISTRATION-INTEGRATION-SETUP.md.

## Validation

**128 backend tests pass**, including all previous 112 and 16 invitation tests. The new checks cover admin-only management, immutable allowed roles, hashed tokens, duplicate/existing contacts, masked preview, required matching proof, actual customer/provider acceptance, phone normalisation, expired/replaced/revoked links, competing acceptance, creation-failure cleanup, paused provider registration and protected admin listing responses. The React production build passes.

Browser checks use isolated fictional fixtures and cover role controls, creation feedback, dismissing the private-link panel, search, revoke/cancel/confirm and layouts at 320, 390, 768, 1024 and 1440 pixels without horizontal document overflow. Real registration/session operations are tested with Express and temporary MongoDB. A complete browser OTP/password/terms acceptance journey and live email/SMS delivery were not performed. No actual invitation was shared or message sent.

Main files: `server/src/account-invitations.js`, `server/test/account-invitations.test.js`, `client/src/pages/AccountInvitations.jsx`/`.css`, and the existing registration, models, routes and dashboards.
