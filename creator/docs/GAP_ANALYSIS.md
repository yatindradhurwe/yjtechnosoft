# Gap analysis and decisions

## What the repository contained

The repository `yatindradhurwe/yjtechnosoft` held one working application: the **YJTechnosoft company website and back office**.

| Area | Existing implementation |
|---|---|
| Stack | React 18 + Vite + Tailwind (JavaScript), Express 4 (JavaScript), MySQL/MariaDB via `mysql2`, JWT in localStorage |
| Features | Company website CMS, clients, quotations, GST invoices, payments, servers/domains, HR (attendance, leave, payroll), recruitment, letters on letterhead, contracts, document vault, email/SMS/WhatsApp notifications, push notifications |
| Tenancy | Single company (no multi-tenancy) |
| Tests | None |

None of the creator-platform modules in the brief existed: no courses or LMS, storefront, checkout, payment gateway integration, memberships, communities, workshops, bookings, affiliates, CRM automation, landing page builder, AI or multi-tenancy.

## Decision: build a separate application in `creator/`

The existing app works and serves a different purpose (one company's website and back office), so it was left untouched. Changing it into a multi-tenant SaaS would have broken working features with no benefit. The creator platform is a new product, like the company's other products (MakeMyProfile, GuardOps, …), and lives in `creator/` with its own API, web app, database and deployment.

The brief allows keeping an existing stack "unless the existing project already has a working stack". The existing stack is single-tenant MySQL JavaScript. For a new multi-tenant product the brief's prescribed stack was used instead (TypeScript, PostgreSQL, Prisma), because PostgreSQL provides features the platform relies on:

* **Exclusion constraints** (`btree_gist`) that make double-booking impossible at the database level.
* `SELECT … FOR UPDATE SKIP LOCKED` for a safe multi-worker job queue.
* Native arrays and JSONB for roles, permissions, page documents and automation definitions.

## Deviations from the brief

| Brief | What was done | Why |
|---|---|---|
| Redis + BullMQ for jobs | Postgres-backed job queue (`BackgroundJob` table) with `SKIP LOCKED`, retries with exponential backoff, idempotency keys and an admin view | Jobs are enqueued **in the same transaction** as the payment or registration that causes them (transactional outbox), so a job exists if and only if the change committed. Redis would need a separate outbox to give the same guarantee. Redis is not required to run the platform. |
| S3 / Supabase storage | Local-disk driver behind a `StorageDriver` interface. Files are served only through API routes with access checks and HMAC-signed, expiring, user-bound URLs | Works on a single VPS with backups. An S3 driver is a pending item (FEATURE_MATRIX). |
| Mux / Cloudflare Stream | Uploaded MP4/WebM files stream through signed URLs with range requests | Transcoding needs provider accounts. Pending; listed as externally dependent. |
| Recurring billing via provider subscriptions | Memberships renew by repeat purchase: periods extend, renewal reminders are sent 3 days before expiry, a 3-day grace period applies, then access expires | Razorpay Subscriptions and Stripe Billing need plan objects created at the provider and a separate webhook flow. Auto-debit is pending. |
| JWT rotation | Short-lived access JWT (15 min, memory only) plus a rotating refresh token in an httpOnly, SameSite=Strict cookie with reuse detection | Matches the brief ("secure sessions or JWT rotation") |

## Assumptions

* Payments are collected by the platform's gateway accounts, and creators are paid out from their ledger balance (marketplace model). Creators do not connect their own gateway accounts.
* GST is charged only when a creator enters a GSTIN, and only to buyers in India. Exports are treated as zero-rated. Creators should confirm rates with a tax adviser.
* WhatsApp and Zoom use each creator's own accounts. Email, payments and AI use platform accounts.
