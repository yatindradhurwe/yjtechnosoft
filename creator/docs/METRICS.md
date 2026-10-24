# Metric definitions

All dashboard numbers are computed from database records when they are requested. Ranges use `paidAt` for revenue and `createdAt` for everything else, unless stated.

| Metric | Definition |
|---|---|
| Revenue | Sum of `Order.total` (incl. tax) for orders with status PAID, PARTIALLY_REFUNDED or REFUNDED, `paidAt` in range |
| Tax collected | Sum of `Order.taxAmount` for the same orders |
| Net earnings | Sum of ledger entries created in range (sales − fees − refunds − commissions + returned fees − payouts) |
| Refunds | Sum of processed refunds, `processedAt` in range |
| Paid orders | Orders created in range that are paid (including later refunded) |
| Checkout conversion | Paid orders ÷ all orders created in range (an order is created when a signed-in buyer clicks Pay) |
| New enrolments | Enrolments created in range |
| New customers | Workspace memberships with the STUDENT role created in range |
| Active learners (30d) | Distinct users with lesson progress updated in the last 30 days |
| Completion rate | Completed enrolments ÷ all enrolments (all time) |
| Failed payments | Payments in FAILED status created in range |
| Renewals due (7d) | Active or grace memberships whose period ends in the next 7 days |
| Affiliate sales / commissions | Commissions created in range, excluding reversed or rejected |
| Messages sent / failed | Message log rows (email, WhatsApp) by status in range; `SKIPPED` means no provider or no consent, never counted as sent |
| Revenue chart | Daily sums of paid order totals, grouped by day in the workspace's time zone |
| Lifetime value (customer) | Sum of totals of the contact's PAID and PARTIALLY_REFUNDED orders |
| Community (30d) | Posts, comments, reactions created in the last 30 days; active members = distinct post authors |
| AI credits | 1 credit = US$0.001 of estimated provider cost (list price per token), minimum 1 per request |
