# Payments, tax, ledger and payouts

## Model

The platform collects payments with its own Razorpay and Stripe accounts and keeps a **ledger** for each workspace. Creators request payouts from their available balance, and a Super Admin approves and records each transfer. This is the marketplace model the brief describes ("creator revenue, platform fees … payout requests and reconciliation").

> Running a marketplace that collects money for third parties has regulatory implications in India (for example the RBI's payment-aggregator rules, or using Razorpay Route). Confirm your set-up with your payment provider and advisers before going live.

## Checkout flow

1. `POST /store/:slug/checkout/quote` prices the order (coupon, tax) without creating anything.
2. `POST /store/:slug/checkout` (signed-in buyer):
   * validates that the product is published and the price is active, that the buyer does not already own a lifetime product, that the coupon applies, and that a workshop ticket still has seats;
   * creates an `Order` (PENDING) with a per-workspace order number, plus a CRM contact;
   * total 0 (free product or 100% coupon): fulfils immediately; there is no payment to verify;
   * INR with Razorpay configured: creates a Razorpay order and returns the Checkout payload;
   * otherwise, if Stripe is configured: creates a Stripe Checkout Session and returns its URL;
   * no provider configured: `503 not_configured`. The UI says so. Nothing is simulated.
3. Payment is **confirmed only server-side**, by either:
   * a verified webhook: Razorpay `payment.captured`/`order.paid`, Stripe `checkout.session.completed`/`async_payment_succeeded`; or
   * `POST …/razorpay/verify`: the server verifies Razorpay's checkout signature with the key secret **and** fetches the order's payments from Razorpay's API, fulfilling only when the API reports a captured payment.
   A browser redirect alone never marks an order paid. The order page polls the server until it sees `PAID`.

## Capture (`src/modules/commerce/capture.ts`)

In one database transaction:

1. The amount and currency must match the payment record exactly. If they do not, the mismatch is recorded and audited and the order is **not** fulfilled.
2. A conditional update moves the payment to `CAPTURED` (only from `CREATED`/`AUTHORIZED`/`FAILED`). If another delivery already captured it, nothing else happens, which makes capture idempotent under duplicate and concurrent webhooks.
3. The order becomes `PAID`; entitlements are granted (course enrolment, files, community, workshop, consultation credit, membership period); an invoice is issued; ledger entries are written; the coupon redemption is counted; any affiliate commission is recorded; the contact is tagged `customer`; the action is audited; and an `order.paid` job is enqueued for the receipt email, the creator notification and automations.

## Tax (GST)

| Setting | Effect |
|---|---|
| No GSTIN on the workspace | No GST is charged |
| GSTIN set, buyer country `IN` | GST at the workspace rate (default 18%) |
| Buyer outside India | No GST (export of services treated as zero-rated) |
| `pricesIncludeTax = true` (default) | The listed price is final; GST is extracted: `tax = total − round(total × 10000 / (10000 + rateBps))` |
| `pricesIncludeTax = false` | GST is added: `tax = round(net × rateBps / 10000)` |

Invoices are numbered per workspace and financial year (April–March): `INV/2026-27/00001`. When the buyer's state code equals the seller's (`gstStateCode`, taken from the GSTIN by default) the tax is split CGST + SGST; otherwise it is IGST. Invoices can be printed or saved as PDF from the browser.

These rules are a reasonable default, not tax advice. Creators should confirm rates and place-of-supply treatment with their tax adviser.

## Fees and the ledger

* Platform fee = `round((total − tax) × plan.platformFeeBps / 10000)`, i.e. charged on the amount excluding tax.
* Gateway fee = the fee Razorpay reports on the payment (Stripe fees are not fetched yet; they are recorded as 0).
* Ledger entries (creator's point of view, signed): `SALE +amount`, `PLATFORM_FEE −fee`, `GATEWAY_FEE −fee`, `AFFILIATE_COMMISSION −commission`, `REFUND −amount`, platform fee returned on refunds `+fee×refund/amount`, `PAYOUT −amount`.
* Balance = sum of entries. Available = balance − payouts that are requested or approved.

## Refunds

* A creator starts a refund from the order page (`orders.refund` permission). The API calls the provider's refund API. If the provider reports the refund as processed, it is applied at once; otherwise it stays `PENDING` until the `refund.processed` (Razorpay) or `refund.updated` (Stripe) webhook arrives.
* Refunds made directly in the provider dashboard are picked up from the same webhooks.
* Applying a refund (exactly once): the payment and order are marked refunded or partially refunded; ledger entries are written; on a **full** refund, entitlements from that order are revoked and the membership is cancelled; affiliate commissions are reversed in full or in proportion.
* Gateway fees are not returned by providers, so they stay as a cost.

## Memberships (recurring prices)

Current behaviour (auto-debit is pending, see FEATURE_MATRIX):

* Buying a recurring price grants access for the interval (30, 91 or 365 days) and creates a `CustomerSubscription`.
* Buying again extends the period from its current end, so early renewals lose nothing.
* Three days before the period ends, a renewal reminder email is sent (once per period).
* When the period ends, the subscription enters `GRACE` with 3 more days of access, then `EXPIRED`. Cancelling at period end skips the grace period.

## Payouts

`REQUESTED` (creator, up to the available balance) → `APPROVED` (Super Admin) → `PAID` (Super Admin records the bank/UTR reference, and a `PAYOUT` ledger entry is written), or `REJECTED`. Each transition is a conditional update, so a payout cannot be paid twice, and every transition is audited.

## Reconciliation

Admin › Payments › Reconciliation compares captured payment amounts with `SALE` ledger entries per workspace and currency, and refunds with `REFUND` entries. Any mismatch should be investigated before payouts.

## Webhook set-up

See PROVIDERS.md for the exact events to enable.
