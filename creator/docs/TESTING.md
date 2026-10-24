# Testing

## Suites

| Suite | Command | What it proves |
|---|---|---|
| API integration (Vitest + Supertest) | `cd server && npm test` | 73 tests against a real PostgreSQL database (`creator_test`, migrated automatically, emptied before each file). Provider HTTP APIs (Razorpay, Stripe, Anthropic) are mocked, but signatures use the real algorithms and secrets. |
| Type checking | `cd server && npm run typecheck`, `cd web && npm run typecheck` | Strict TypeScript on both apps |
| Browser E2E (Playwright) | `cd web && npm run test:e2e` | The core business flow through the real UI (below) |

Set-up for the API tests: create the database once with `createdb -O creator creator_test`, then run `CREATE EXTENSION btree_gist` as a superuser. Override the connection with `TEST_DATABASE_URL`.

## Browser E2E flow

Run it with the API in development mode and the web app running. It covers:
* the marketing home page rendered from the CMS;
* a creator signs up, verifies their email and creates a workspace;
* the creator saves branding, builds and publishes a course, then creates and publishes a product;
* a buyer opens the storefront, signs up, checks out (a free product, since no live keys are present), opens the course and completes the lesson;
* the mobile storefront at 390px has no horizontal overflow;
* the creator dashboard shows the real enrolment, and the CRM lists the buyer;
* the Super Admin signs in and sees the new workspace;
* no page throws a JavaScript error.

Paid checkout through the UI needs real test keys. Without them, the UI shows "payments not configured". Paid flows are proven by the API tests, which use real signature verification.

## Coverage by area (test names)


**auth**

* signs up, verifies email, and returns profile
* stores passwords hashed with argon2id
* rejects duplicate signup and wrong password with a generic message
* locks the account after repeated failures
* signs in with an email OTP and a code cannot be reused
* does not reveal whether an email exists when requesting an OTP
* rotates refresh tokens and detects reuse
* requires the CSRF header on cookie-authenticated endpoints
* resets a password with a code and ends existing sessions
* rejects requests without a valid access token

**tenancy**

* requires a verified email to create a workspace
* creates a workspace with the owner role and default plan, and audits it
* rejects reserved or taken slugs
* isolates tenants: a creator cannot access another workspace
* enforces granular permissions for team members
* validates GSTIN format
* only lets platform support in with an owner-granted, unexpired grant

**admin**

* blocks normal users and creators from the admin API
* support staff can read but not write
* suspends a workspace (with audit) which blocks its dashboard and storefront
* suspending a user ends their sessions
* cannot change own role
* stores integration secrets encrypted and never returns them
* manages CMS pages with validated blocks; only published pages are public
* evaluates feature flags with allowlists and rollout

**commerce**

* lists published products and the curriculum outline publicly
* allows free-preview lessons but blocks paid lessons before purchase
* creates a pending order and a Razorpay order
* never fulfils from a forged browser callback
* rejects webhooks with an invalid signature
* does not fulfil when the paid amount does not match
* fulfils on a verified payment.captured webhook
* is idempotent for duplicate and replayed webhook deliveries
* prevents buying the same course twice
* shows real revenue on the creator dashboard
* refunds through the provider, revokes access and reverses the ledger
* confirms payment via server-side Razorpay API lookup when the webhook is late
* extracts GST from tax-inclusive prices and splits CGST/SGST intra-state
* applies coupons, enforces limits, and fulfils 100%-off orders without payment
* blocks cross-tenant reads, writes and resource references
* restricts students from the creator dashboard
* enforces sequential drip, grades quizzes server-side, issues certificates, awards points once
* reorders the curriculum only with ids from the same course

**stripe-media**

* fulfils a USD order only from a signed checkout.session.completed event, once
* rejects disallowed and disguised files
* serves private files only through valid, unexpired signed URLs
* serves public images without auth

**engagement**

* never exceeds capacity under concurrent registrations, waitlists the rest, and promotes on cancel
* rejects registrations when full and the waitlist is off
* reveals the meeting link only to registered attendees and sends a confirmation
* requires a ticket purchase for paid workshops
* generates DST-safe slots that respect buffers, notice and busy times
* prevents double booking even with simultaneous requests (database exclusion constraint)
* rejects times outside availability and requires purchase for paid sessions
* enforces access on every request for paid communities
* lets members post in feeds but only staff in announcements; moderators hide content
* handles reports and bans, which remove access
* limits posting rate and link spam
* supports direct messages between members only, respecting blocks
* awards challenge points once, tracks habit streaks, and auto-awards badges

**growth**

* attributes by click within the window, pays product-specific rates, blocks self-referral, reverses on refund
* runs workflows once per event with delays, conditions and tags, respecting unsubscribes
* sends campaigns only to consenting contacts and honours one-click unsubscribe
* validates blocks, publishes immutable versions, rolls back, and renders only published content
* only routes custom domains after DNS verification
* evaluates formulas safely without executing code
* publishes a calculator, hides formulas, enforces access and saves history
* is unavailable without a provider and never fakes output
* uses tenant-scoped tools, meters credits, and only applies drafts on explicit approval
* extends on renewal, enters a grace period, then expires access
* serves public posts to anyone, members-only posts to members, and counts unique views

**realtime**

* rejects unauthenticated sockets
* only joins channel rooms the user can read, and delivers new posts

## Not covered by automated tests

* Live provider accounts (Razorpay, Stripe, SMTP, Google, WhatsApp, Zoom, Anthropic and OpenAI). Test each in its sandbox, as described in PROVIDERS.md.
* Load and performance testing.
* Visual regression. The E2E run saves screenshots for manual review.
* Accessibility audit with assistive technology. Labels and roles are exercised by the E2E selectors, but no WCAG audit has been done.
