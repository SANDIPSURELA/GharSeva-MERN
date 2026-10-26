# Page 2 — Services

Open **Find services** in the navigation, or visit http://localhost:5173/services.

## Apply the update on Windows

1. Extract the updated ZIP into a separate temporary folder. Open its `GharSeva-MERN` folder.
2. Keep your existing demo running. Copy the extracted **client/src** folder into **Z:\SEM 6\Xampp\htdocs\GharSeva-MERN\client**. Merge the folders and choose **Replace the files in the destination**.
3. Open the website and press **Ctrl+F5**. Vite normally reloads the changed frontend automatically.

Copy the entire **src** folder, rather than just Services.jsx: this update also changes its styles, route imports and the shared provider card. You do not need to copy the whole client folder or reinstall packages.

If the update does not appear, stop your existing demo with Ctrl+C, enter `Y` if Windows asks about terminating the batch job, and run this from your original project root:

```powershell
npm.cmd run demo
```

Stopping the temporary demo resets its records. If you use Atlas with `npm.cmd run dev`, restart with that command instead.

## What to review

| Feature | How to try it |
| --- | --- |
| Category browsing | Choose any of the ten enabled categories. Counts use real listed profiles and the selected city. |
| Category guides | Choose Plumbing to see common jobs, a category starting-price guide and details to include in a booking request. |
| Detailed provider cards | Read the short biography, skills, experience, reviews and completed-service count. Open the full profile to continue. |
| Search | Search `plumbing Bengaluru`, a professional's name, a skill or a local area. Every word must match the profile. |
| Filters | Combine category, city, maximum starting visit price, minimum rating and accepting-new-requests status. |
| Active filter chips | Remove a single filter without clearing the others. Clear all preserves the chosen sort order. |
| Sorting | Switch between highest rated, lowest starting price and most experience. |
| Pagination | All listed cities show twelve sample professionals, with nine on the first page and three on the second. Changing a filter returns to the first page. |
| Compare | Add two or three professionals using their cards, then open the side-by-side comparison. |
| Mobile filters | Open Show filters, make selections and use Show professionals to close the filters and return to the results. |
| Empty results | Select a budget with no matches, or visit `/services?city=Ahmedabad`. The page explains the result and offers ways to adjust the search. |

Sample profiles are fictional. Ratings and completed-service counts come from database records. A rating filter hides new profiles without reviews. Accepting requests does not promise an available appointment: dates and times are checked when booking, and confirmation requires provider acceptance. Additional work and materials are agreed separately; payment is on site.

## Source changes

The Services page is now in `client/src/pages/Services.jsx` with scoped styles in `Services.css`. `App.jsx` imports the page, and its earlier implementation has been removed from `Public.jsx`. `components/UI.jsx` adds optional details to provider cards and clearer accessible labels. Home retains its compact provider cards.

## Verification

The production build and browser checks passed. Checks cover category navigation, pagination, combined filters, removable chips, sorting, multi-word search, unknown-city/category URLs, custom price/rating URLs, comparison, profile links, logged-out favourites, mobile filter controls, image loading and responsive widths of 320, 390, 768, 1024 and 1440 pixels. No uncaught JavaScript errors were detected. Home's category, city/search and FAQ checks also passed.

The backend and installed dependencies are unchanged by this update. Earlier backend and full-booking verification is recorded in `VERIFICATION.md`.

## Next page

Provider profile: detailed skills and work examples, reviews, appointment availability and a clearer path into booking.
