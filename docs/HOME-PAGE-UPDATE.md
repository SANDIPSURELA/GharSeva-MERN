# Page 1 — Home

The Home page now lives in `client/src/pages/Home.jsx`, with its additional styles in `client/src/pages/Home.css`. `App.jsx` imports this component; the earlier Home component was removed from `Public.jsx`.

## Apply this update to the project already running on Windows

1. Download the updated project ZIP and extract it into a **different temporary folder**, such as Downloads. Open the extracted `GharSeva-MERN` folder.
2. Leave your current demo running.
3. Copy the updated **client/src** folder into your original project's **client** folder. Merge it with the existing `src` folder and choose **Replace the files in the destination**. For your current setup, paste `src` into `Z:\SEM 6\Xampp\htdocs\GharSeva-MERN\client`.
4. Vite normally reloads the changed frontend automatically. Open http://localhost:5173 and press Ctrl+F5.
5. If the earlier design still remains, stop the demo with Ctrl+C. If Windows asks `Terminate batch job (Y/N)?`, enter `Y`, then run:

```powershell
npm.cmd run demo
```

Refresh the browser again after the server restarts.

This is a frontend source update. Your installed packages stay in place, so **you do not need to run npm ci again**. The demo's MongoDB binary should already be cached from the successful setup. Stopping the temporary demo resets its sample records, as before.

If you already configured Atlas and run `npm.cmd run dev`, restart with that command instead.

## What to review

| Section | Content / behavior |
| --- | --- |
| Welcome and search | Clear introduction, service keyword, listed-city selector and popular service links |
| Booking at a glance | Profile review, appointments, visit code and pay-on-site expectations |
| Services | Every enabled category, its description, photograph and starting price |
| Helpful tools | Guided service finder, provider comparison and private visit code explained |
| Professionals | City buttons update the same city selection used by search and category links |
| Booking journey | Find, request, arrival/OTP, completion/payment/review |
| Before the visit | Job details, address, estimate and visit-code guidance |
| Questions | Six expandable answers with accurate confirmation, pricing and cancellation rules |
| Professional registration | Approval requirements and workspace benefits; logged-in providers see their workspace link |

Review the page at desktop width and a narrow mobile width. Search for `plumbing` in `Bengaluru` to try the seeded customer/provider demonstration. Sample profiles remain fictional; the new homepage does not invent customer totals or testimonials.

## Checks performed

Production build passed. Browser checks passed for the complete category list, synchronized city controls, local provider cards, search and category links, expandable FAQ answers, image loading, and page widths of 320, 390, 768, 1024 and 1440 pixels. No uncaught JavaScript errors were detected.

The backend and dependencies are unchanged by this Home page update. The earlier backend and booking-journey verification is recorded in `VERIFICATION.md`.

## Next page

Review Home first, then improve Services: filter layout, detailed service information, provider cards, empty results, sorting and the route into booking.
