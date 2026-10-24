# Feature completion matrix

Legend: **Done** = implemented and usable in the UI and API. **Tested** = covered by automated tests (A = API integration, E = browser E2E). **Pending** = not built yet. **External** = needs provider credentials; built, but not verified against a live account.

| § | Feature | Status | Tested | Notes |
|---|---|---|---|---|
| 3 | Roles: Super Admin, Support, Owner, Admin, Team member, Instructor, Moderator, Affiliate, Student | Done | A | Granular permissions plus per-member grants |
| 3 | Restricted support access (owner-granted, time-limited, read-only) | Done | A | No impersonation, by design |
| 3 | Named custom roles | Pending | | Extra permission grants per member exist |
| 4 | Website CMS (pages, blocks, SEO, publish, site settings, announcements) | Done | A, E | |
| 5 | Creator dashboard with real metrics, revenue chart, setup checklist | Done | A, E | Definitions in METRICS.md |
| 6 | Courses: modules, lessons (video/text/file/embed), drip (date, days, sequential), previews | Done | A, E | |
| 6 | Quizzes (server graded), assignments, certificates with public verification, reviews, progress | Done | A | |
| 6 | Video transcoding, adaptive streaming, DRM, device limits | Pending / External | | Signed file URLs today; Mux/Cloudflare not integrated |
| 7 | Workshops: capacity (race-safe), waitlist, tickets, reminders, attendance | Done | A | |
| 7 | Zoom meeting creation | External | A (mock) | S2S OAuth |
| 7 | Google Meet/Calendar, Zoom attendance or recording import, workshop certificates, feedback, post-session offer | Pending | | |
| 8 | Memberships with access periods, renewal reminders, grace period, expiry | Done | A | |
| 8 | Auto-debit subscriptions (Razorpay Subscriptions / Stripe Billing), proration, upgrades | Pending | | Renewals are manual repurchases |
| 8 | Communities: channels, feeds, announcements, comments, reactions, DMs, moderation, reports, bans, blocks, real time | Done | A | |
| 8 | Polls, mentions, media in posts | Pending | | |
| 9 | Consultations: availability, time zones, buffers, notice, no double booking (DB constraint), paid sessions, reschedule/cancel | Done | A | |
| 10 | Storefront: products, bundles, digital downloads, coupons, custom domain routing, mobile layout | Done | A, E | |
| 10 | Order bumps, upsells, installments | Pending | | |
| 11 | Landing pages and funnels: block builder, versions, rollback, SEO, lead forms | Done | A | |
| 11 | Full multi-step funnel with upsell step | Pending | | |
| 12 | Razorpay checkout, verify, webhooks, refunds | Done / External | A (signed mocks) | Test with sandbox keys before launch |
| 12 | Stripe Checkout, webhooks, refunds | Done / External | A (signed mocks) | |
| 12 | GST (inclusive/exclusive, CGST/SGST/IGST), invoices, ledger, platform fees, payouts, reconciliation | Done | A | Server-side PDF pending (print to PDF works) |
| 12 | RazorpayX automated payouts | Pending | | Payouts are recorded manually |
| 13 | CRM: contacts, tags, notes, timeline, lifetime value, CSV import/export | Done | A, E | |
| 13 | Email campaigns with consent and unsubscribe | Done / External | A | Needs SMTP |
| 13 | Automation workflows (triggers, delays, conditions, email, WhatsApp, tags) | Done | A | |
| 13 | WhatsApp template messages | External | | Inbound and status webhooks pending |
| 13 | Saved segments, open/click tracking, retention automation, native Resend/SES API | Pending | | SMTP works with any of these services |
| 14 | Affiliates: applications, links, last-click attribution, product rates, reversals | Done | A | AFFILIATES.md |
| 15 | Gamification: points, badges, leaderboards, challenges, habits, streaks | Done | A | |
| 16 | AI assistant: tenant-scoped read-only tools, credits, drafts applied only on approval | Done / External | A (mock) | Anthropic or OpenAI key |
| 17 | AI page drafting | Done / External | A (mock) | |
| 17 | AI theme generation | Pending | | Manual theme editor exists |
| 18 | Creator tools (calculators with sandboxed formulas, history) | Done | A | |
| 19 | Short-video feed (public and members-only, likes, comments, views) | Done | A | No transcoding |
| 20 | Analytics dashboards | Done | A | Cohort and UTM analytics pending |
| 21 | Super Admin: tenants, users, plans, integrations, finance, CMS, flags, jobs, webhooks, audit, support desk | Done | A, E | |
| 21 | Self-serve purchase of SaaS plans by creators | Pending | | Admin assigns plans today |
| 22 | White-label: brand colours, logo, fonts, custom domains (verified), on-demand TLS | Done | A | |
| 22 | Branded mobile app configuration | Pending | | |
| 23 | Database: 93 tables, migrations, constraints, indexes, seed (demo only when asked) | Done | A | |
| 24 | Security controls | Done | A | SECURITY.md; no certification claimed |
| 24 | Two-factor authentication | Pending | | |
| — | Auth: email + password, email OTP, Google | Done / External (Google) | A, E | |
| — | Phone OTP | Pending | | Needs an SMS provider |
| — | Object storage (S3/Supabase) | Pending | | Local disk with signed URLs |
| — | Redis/BullMQ, Socket.IO Redis adapter, shared rate-limit store | Deviation / Pending | | A Postgres queue replaces BullMQ (multi-worker safe); single API instance today |
| — | Deployment: PM2 + Nginx, Docker Compose + Caddy, backups and restore | Done | | Not exercised on a live VPS here |

## Definition of done

A creator can register, verify their email, brand a workspace, create and publish a product, sell it with payment confirmed by the server, deliver the content, manage customers, and see real revenue (E2E, plus the commerce API tests for paid flows). A Super Admin can manage tenants, plans, permissions, integrations and operations. **Paid checkout has not been run against live Razorpay or Stripe accounts**. Doing that with sandbox keys is the first step before launch.
