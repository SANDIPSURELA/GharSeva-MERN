# Project notes and viva preparation

## Problem and solution

Customers need a clear way to find household services, compare professionals and track an appointment. Providers need a connected place to manage incoming jobs. Administrators need to review profiles and manage records. GharSeva connects these three roles through one MongoDB database and an Express API.

## Three distinguishing features

1. **Guided service finder.** User selects a household issue, city and priority. Explained rules map that issue to a service category and show matching available professionals. No AI/API subscription is required.
2. **Provider comparison.** Up to three selected professionals are compared by category, area, starting price, experience, rating, completed jobs, availability and skills. Only IDs are kept in sessionStorage for this temporary selection.
3. **Visit OTP.** A server-generated six-digit code is returned only to the assigned customer. The provider must enter it to move from ON_THE_WAY to IN_PROGRESS. Wrong attempts are counted; after five wrong attempts the code locks until the customer refreshes it. It is a consent-to-start code, not SMS phone verification.

Priority requests are also highlighted in the job inbox. A priority flag does not guarantee a faster visit.

## Booking lifecycle

PENDING → ACCEPTED → ON_THE_WAY → IN_PROGRESS (OTP required) → COMPLETED.

Provider can reject PENDING. Customer can cancel or reschedule PENDING/ACCEPTED. Reschedule returns the appointment to PENDING and generates a fresh code. Active bookings have a unique compound provider/date/time index; terminal bookings free that slot. Time is validated against Asia/Kolkata, within 90 days and against the provider's working days/start times.

## Data collections

| Collection | Main relationships / information |
| --- | --- |
| users | Role, contact details, password hash, provider profile, addresses, favourites |
| categories | Unique slug, price hint, image and visibility |
| bookings | Customer and provider references, schedule, estimate, status, timeline, private visit code |
| reviews | Unique booking reference, customer/provider references, rating, feedback and moderation |
| enquiries | Contact form fields and resolution status |
| files | Owner reference, kind, MIME and uploaded bytes |
| settings | Booking and provider-registration controls |

Profile images and portfolio photographs are publicly visible. Supporting documents require owner/admin authentication. Files are limited to 1 MB for photos and 3 MB for documents; signature checks allow JPG, PNG, WebP and PDF. This simple MongoDB file storage suits a college project; larger production systems should use dedicated object storage and additional file processing.

## API map

| Method / endpoint | Access |
| --- | --- |
| GET /api/health, /api/config, /api/categories, /api/providers | Public |
| GET /api/providers/:id, /api/providers/:id/slots?date=YYYY-MM-DD | Public |
| POST /api/auth/register, /api/auth/login, /api/auth/logout | Public; registration allows customer/provider only |
| GET /api/auth/me, PATCH /api/auth/me | Logged-in account |
| POST /api/auth/change-password | Logged-in account |
| POST /api/favourites/:id | Customer |
| POST /api/files, DELETE /api/files/:id | Provider / owner |
| GET /api/files/:id | Photo/portfolio public; document owner/admin only |
| GET /api/bookings | Own customer/provider bookings; all for admin |
| POST /api/bookings | Customer |
| PATCH /api/bookings/:id/status | Assigned customer/provider with allowed transition |
| PATCH /api/bookings/:id/schedule | Assigned customer before travel/work |
| POST /api/bookings/:id/visit-code | Assigned customer before work starts |
| GET /api/reviews/mine, POST /api/reviews | Role-scoped listing; completed-booking customer review |
| POST /api/enquiries | Public |
| GET /api/admin/overview | Admin |
| PATCH /api/admin/users/:id | Admin approval / account status |
| POST /api/admin/categories, PATCH /api/admin/categories/:id | Admin |
| PATCH /api/admin/reviews/:id, /api/admin/enquiries/:id, /api/admin/settings | Admin |

State-changing requests require `X-GharSeva: 1`. Authentication uses signed HttpOnly session cookies; the API loads the account and checks its role/status on each protected request. Mongoose validates data; route handlers allow only specific fields. Password hashes are excluded from normal queries/responses.

## Design

White surfaces, navy text, teal accents, restrained orange details, consistent cards and responsive layouts. Service photographs ship in the project; the website does not require remote image URLs at runtime. Provider identity defaults to initials until a real profile photo is uploaded. Sample service images are labelled to avoid presenting stock photographs as a named provider's identity or actual completed work.

## Image sources

Photos downloaded from Unsplash. License: https://unsplash.com/license. These sources are service/home illustration assets, not customer or provider identity evidence.

| Local file | Original source |
| --- | --- |
| client/public/images/home.jpg | https://images.unsplash.com/photo-1600585154340-be6161a56a0c |
| client/public/images/cleaning.jpg | https://images.unsplash.com/photo-1581578731548-c64695cc6952 |
| client/public/images/electrical.jpg | https://images.unsplash.com/photo-1621905251189-08b45d6a269e |
| client/public/images/carpentry.jpg | https://images.unsplash.com/photo-1504148455328-c376907d081c |
| client/public/images/gardening.jpg | https://images.unsplash.com/photo-1416879595882-3373a0480b5b |
| client/public/images/professional.jpg | https://images.unsplash.com/photo-1581092918056-0c4c3acd3789 |
| client/public/images/plumbing.jpg | https://images.unsplash.com/photo-1607472586893-edb57bdc0e39 |
| client/public/images/cooking.jpg | https://images.unsplash.com/photo-1556911220-bff31c812dba |
| client/public/images/masonry.jpg | https://images.unsplash.com/photo-1504307651254-35680f356dfd |
| client/public/images/painting.jpg | https://images.unsplash.com/photo-1562259949-e8e7689d7828 |

## Deliberate scope limits

- No online payment processing, SMS OTP, external background-check service or email delivery.
- No fake password-recovery response. Logged-in users can change a password; otherwise the contact page directs them to the project administrator.
- Provider availability reserves identical start slots; it is not a travel-time/variable-duration calendar engine.
- Provider has one main category and one starting visit price. Skills describe offerings; this is not a full multi-item price catalogue.
- Dashboards poll every 15 seconds while visible. There is no WebSocket claim.
- Sample records are fictional. Metrics are derived from database bookings/reviews/users, not hardcoded success statistics.
- Visit OTP is stored as a private database field and protected in API responses. A database administrator can access it; it is not an end-to-end secret.
- Public deployment, email recovery, account deletion/export and payment gateways are further work, not hidden functioning features.

## Submission explanation

“React renders the UI. Express defines REST endpoints. Node runs Express. MongoDB stores related records. Each role requests the records it owns or administers. Business rules are enforced on the server, not just hidden by the interface. Postman tests the same API used by React.”
