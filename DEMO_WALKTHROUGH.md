# Classroom booking demonstration

Use a fresh temporary classroom for the exact credentials and prices below. For an existing database, first preview/apply expansion using DEMO_ACCOUNTS.md and use the actual creation password of each persistent account. Existing accounts are never reset by the list or expansion.

## Start and sign in

1. In PowerShell run:

   ```powershell
   Set-Location C:\workspace\GharSeva-MERN
   npm.cmd run demo
   ```

2. Open http://localhost:5173 in two **separate browser profiles or separate browsers** (for example Chrome and Edge). Tabs in the same profile share one login; signing into another account there changes that profile's session. Keep the terminal running.
3. In the customer browser open /login. Enter **customer@gharseva.com** (or **9876500001**) and **Customer123**. Continue to the email OTP screen, read the explicitly labelled classroom code shown there and enter it. All three roles retain password + OTP. There is no code bypass and no real email/SMS delivery in this mode. Codes expire and cannot be reused.
4. The service-city bar should show **Ahmedabad**, the fictional customer's saved default. Real users select a city themselves; existing cityless users see a one-time save-city step. Change city only changes browsing until Save as my default city is pressed.

## Make a real request to Kiran Patel

5. Open **Services**, choose **Plumbing**, and keep city **Ahmedabad**. Clear a rating filter if newly added professionals are hidden: they have no invented reviews. The new Ahmedabad professionals start approved and accepting requests. They have honest work-photo placeholders; existing providers retain their distinct sample images.
6. Select the card named **Kiran Patel**, serving **Satellite, Ahmedabad**, starting at **₹349**. This displayed name maps exactly to **ahm.plumbing1@example.com / 9876520001 / Provider123** in DEMO_ACCOUNTS.md. Nilesh Shah is a different professional with a different account; do not sign in as him for Kiran's request.
7. Open Kiran's profile and choose its booking action. Choose **tomorrow in IST** or another future date within 90 days. Pick one of the returned free times (09:00, 11:00, 14:00 or 16:00). If a slot is taken by an earlier demonstration, choose another returned free slot or another future day. The server rechecks it at submission.
8. Enter a complete fictional service address, such as **42 Sample Society, Satellite Road, Satellite, Ahmedabad, Gujarat 380015**, plus useful job notes. City alone is not the full address. Submit the booking request. For the assistant alternative, describe “Tap leaking”, retain Ahmedabad, choose a future date, choose Kiran, choose a returned time, enter the full address, prepare/review and explicitly confirm.
9. Follow **View my booking** to `/dashboard/customer?section=bookings` (**My bookings**). Show the new **PENDING** request, Kiran's name and the booking reference. No seeded accepted request substitutes for this step.

## Receive and accept as the exact provider

10. In the second browser profile open `/provider/login`. Sign in with **ahm.plumbing1@example.com** (or **9876520001**) and **Provider123**, then enter that login screen's newly displayed classroom email OTP. OTPs belong to the current login challenge; never reuse the customer's code.
11. Open **New requests** at `/dashboard/provider?section=requests`. Locate the same date, time, customer and booking reference. It appears only for the assigned professional. Click **Accept request**. Open **My jobs** at `/dashboard/provider?section=jobs` to show **ACCEPTED**.
12. Return to the customer browser, **My bookings**. Visible dashboards poll the server every **15 seconds**. Wait for the next poll or click **Refresh** to fetch immediately. After switching back to a tab, Refresh is the clearest classroom check. Show the same booking's **ACCEPTED** status. A copied dashboard URL never grants another role or another provider access.

## Continue through deposit, visit OTP and remaining payment

13. As customer click **Bill, payments & receipts** for the accepted booking, or open **Bills & payments**. Review the deposit consent and click **Open deposit simulation**, then **Simulate success**. The new deposit/balance plan uses the configured deposit (₹99 by default, capped at the starting estimate). It must be captured before service starts. Demo simulation moves no real money; do not use a historical sample booking to show the new plan.
14. As Kiran open **My jobs**, choose **I'm on the way**, then **Enter visit OTP**. The customer reads their private six-digit **visit OTP** in My bookings and shares it only when ready for work to start. The provider enters it to move the request to **IN_PROGRESS**. This is distinct from the email login OTP. Incorrect OTPs do not start work; a missing captured deposit also blocks start.
15. If extra work/materials are needed, propose them through the booking's billing panel and have the customer approve them before including them. For a simple demonstration use no extras. As provider choose **Complete service** and confirm. Completion and payment collection remain separate states.
16. Open **Bills & collection → Bill, payments & receipts** as provider. Use **Submit itemised final bill**, enter the agreed service charge and submit it for customer approval. For Kiran's unchanged ₹349 estimate with no extras, use a ₹349 service item. Do not invent tax or unapproved extras; the editor enforces the estimate/approval rules.
17. As customer reopen **Bill, payments & receipts**, review the items and click **Approve bill & continue to payment**. The captured deposit is deducted once: ₹349 total − ₹99 deposit = **₹250 remaining** with default settings. Review/consent and click **Open balance simulation**, then **Simulate success**. Show the paid receipt/ledger and remaining amount zero. Amounts follow the actual saved bill and deposit if settings changed.
18. Optionally leave a review for the completed booking. Administrator login is **admin@gharseva.com / 9876500003 / Admin12345**, plus its own classroom email OTP; admin can show All bookings and Payment ledger. Sensitive admin actions may request recent password/email-OTP verification. Keep role sessions in separate browser profiles.

## City-filtering demonstration

Select Pune with **Change city**. Ahmedabad professionals disappear; assistant selections, locality/time and comparison are cleared. Pune shows only eligible Pune providers. Try an empty city/service combination and show the change-city/service guidance. Change back to Ahmedabad. Browsing Pune does not silently change the saved default. Save as my default city is the explicit persistent action. Booking submission checks the chosen city against the professional's service-profile city and still requires the full address.

Classroom OTP display requires AUTH_DELIVERY_MODE=test + GHARSEVA_DEMO=true + non-production; npm.cmd run demo sets these explicitly. Production refuses this mode and requires live delivery, with no displayed codes. Do not set classroom flags on a production server. No production OTP or auth bypass was added.
