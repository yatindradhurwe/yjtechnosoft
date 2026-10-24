# Affiliate rules

* **Joining:** a signed-in user applies from `/s/:store/affiliates` and gets a code. The creator approves, rejects or suspends affiliates. Only `APPROVED` affiliates track clicks or earn.
* **Links:** `https://app/s/:store?ref=CODE`. Visiting stores the code for 30 days in the visitor's browser and records a click against a random first-party visitor id. Clicks are deduplicated per visitor per affiliate per hour and rate limited per IP.
* **Attribution (last click):** an explicit referral code at checkout wins. Otherwise the most recent click by the same visitor within **30 days** counts.
* **Not attributed:** self-referrals (the affiliate buying), and unapproved or suspended affiliates.
* **Rate:** a product-specific rate if one is set, otherwise the affiliate's default rate (10% unless changed).
* **Base:** each order line's total excluding tax.
* **One commission per order:** enforced by a unique constraint.
* **Lifecycle:** `PENDING` → `APPROVED` → `PAID`, or `REJECTED`. A commission on a refunded order cannot be approved.
* **Refunds:** a full refund reverses the commission (`REVERSED`); a partial refund reduces it in proportion. Commissions already `PAID` are not changed automatically and must be recovered manually.
* **Ledger:** a commission is debited from the creator's balance when it is recorded and credited back if it is rejected or reversed. Paying affiliates happens outside the platform; the creator marks commissions as paid.
* **Privacy:** affiliates see clicks, conversions and amounts, but never buyer identities.
