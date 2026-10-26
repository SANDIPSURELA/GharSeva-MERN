# Page 3 — Provider Profile

Open **Find services**, then choose **View profile** on a professional's card. The seeded Rajesh Kumar profile has a completed booking and one sample review; other profiles demonstrate the new-review state.

## Apply this update on Windows

1. Download the updated ZIP and extract it into a separate temporary folder.
2. Open the extracted `GharSeva-MERN/client` folder and copy its complete **src** folder.
3. Paste it into **Z:\SEM 6\Xampp\htdocs\GharSeva-MERN\client**, merge the folders and choose **Replace the files in the destination**.
4. Keep your existing demo running. Open http://localhost:5173 and press **Ctrl+F5**.

Copy all of `src`: this update includes the profile, its styles, route imports, date helpers, appointment handoff and a login-redirect fix. You do not need to copy the entire client folder or reinstall packages.

If the page does not update, stop the demo with Ctrl+C, enter `Y` if Windows asks about terminating the batch job, then run this from your original project root:

```powershell
npm.cmd run demo
```

Stopping the temporary demo resets its records. If you use Atlas with `npm.cmd run dev`, restart with that command instead.

## What to review

| Section / feature | Behavior |
| --- | --- |
| Profile introduction | Name, service, location, administrator review, customer rating and starting visit price |
| Platform history | Actual completed-service count, listed experience and accepting-request status |
| Save, compare and share | Save in a customer account, add to comparison and copy the profile link |
| Overview | Full biography, listed service area and actual professional skills |
| Visit expectations | Starting estimate, agreement on additional work/materials, provider confirmation, private visit code and pay-on-site guidance |
| Work examples | Profile photos open in a larger viewer with next/previous controls, keyboard focus handling and Escape to close |
| Customer experiences | Real review summary, distribution of loaded reviews, rating filter and newest/oldest/highest/lowest sorting |
| New profiles | Clear no-review and no-photo states; no invented ratings or testimonials |
| Appointments | Date picker, four upcoming-date shortcuts, live start times in IST and listed working days |
| Booking handoff | A selected date/time travels into booking, including through customer login. Availability is checked again; a time taken by another request is cleared. |
| Unavailable states | Separate messages for a professional not accepting requests, paused platform bookings, no open times and a connection error with retry |

## Try the complete flow

1. Open Rajesh Kumar's profile and select a live appointment time.
2. Click **Request a booking**. If logged out, log in as `customer@gharseva.com` with `Customer123` in the seeded demo.
3. The booking form retains the selected date and time. Add your address and job details, then send the request.
4. Track the Pending request in the customer dashboard. Sending a request requires provider acceptance before it is confirmed.

The profile does not create a booking by itself. Administrator/provider accounts see a customer-account explanation. The server remains responsible for validating permissions and preventing duplicate active bookings.

Profiles and photos in the seeded demo are fictional. Reviews and completed counts use database records. The rating distribution reflects the reviews loaded on the profile; the API returns up to 30 recent reviews, while the overall score uses all visible reviews.

## Source changes

- `pages/ProviderDetails.jsx` and `ProviderDetails.css`: independent profile page and scoped styles.
- `App.jsx` and `pages/Public.jsx`: route import and removal of the earlier profile component.
- `api.js`: shared India-date helper.
- `pages/Booking.jsx`: selected appointment handoff, malformed-date fallback, slot recheck and submission disabled while availability is loading.
- `pages/Auth.jsx`: consistent return to the requested booking route after login, including its query parameters.

## Verification

Production build passed. Browser checks covered profile data, review filters and sorting, gallery navigation and keyboard focus, sharing, comparison, saved professionals, live schedules, login handoff, a submitted booking, stale-slot rejection, invalid booking dates, unavailable/paused/empty/error states, account roles and image loading. The profile was checked at widths of 320, 390, 768, 1024 and 1440 pixels without horizontal overflow or uncaught JavaScript errors.

The complete browser booking journey also passed: request, acceptance, travel, OTP verification, completion, review and administrator visibility. See `VERIFICATION.md` for the written results.

## Next page

Booking: appointment and address entry, helpful job details, clear estimate, confirmation and the request receipt.
