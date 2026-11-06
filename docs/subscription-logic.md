# Subscription and demo payment rules

Proposed plans: Monthly NGN 1,000; Quarterly NGN 2,700; Six months NGN 4,800; Yearly NGN 8,500. Admins can change names, prices and availability; durations are defined in seed data. Amounts are stored as 100000, 270000, 480000 and 850000 kobo.

1. A signed-in reader chooses an active plan and manual/automatic renewal preference.
2. The browser supplies a unique reference for this checkout attempt. Repeated clicks reuse that reference.
3. The backend obtains the current amount from the plan table. A client cannot supply a lower price.
4. The isolated demo provider authorizes a simulation; no external request or charge occurs.
5. One SQLite transaction checks the reference, creates/updates the membership, and inserts the successful demo payment.
6. A replay of the same reference by the same user and same plan returns the existing payment, without extending access again. A reference reused by another user or plan is rejected.
7. The successful UI shows membership access and the recorded Demo Payment.

New or expired membership starts from the actual current UTC time. Renewal of an active membership adds the selected plan's calendar months to the current expiry, preserving already paid time. At a month end, clamp to the last valid day: January 31 + one month = February 28 (29 in a leap year).

The demo preview date controls only the featured devotional. It never controls subscription expiry. Active subscribers can access every published archive entry, including readings after the preview date. Drafts require admin access.

Cancellation sets cancel_at_period_end and does not change expires_at. The user retains access until that instant. Switching renewal preference can re-enable future renewal. Manual renewal always uses a new checkout reference and clears the cancellation flag.

Automatic renewal is a stored preference only. There is no billing scheduler and no real charging mechanism. Seeded yearly membership has no fabricated payment record; it is explicitly a development entitlement.

For Paystack later: verify transactions server-side, validate webhook signatures and replay protection, reconcile amounts/currency and ownership, then activate access transactionally. Add pending/failed/refunded states and a verified live provider implementation. The current schema deliberately permits only the demo provider; enabling a real provider requires a reviewed migration and implementation.
