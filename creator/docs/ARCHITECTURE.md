# Architecture

```
Browser (React SPA) ──HTTPS──> Nginx / Caddy ──/api──> Express API ──> PostgreSQL
                     <──WebSocket (Socket.IO /api/socket.io)──┘   │
                                                                   ├─> Worker (in-process or `npm run worker`)
Razorpay / Stripe ──signed webhooks──> /api/webhooks/*             └─> Uploads directory (private)
SMTP · Meta WhatsApp Cloud API · Zoom · Anthropic/OpenAI <── outbound calls
```

## Modules (server/src/modules)

| Module | Responsibility |
|---|---|
| `auth` | Signup, password login with lockout, email OTP login, email verification, password reset, refresh-token rotation, Google OAuth, profile, data export, account deletion |
| `tenants` | Workspace creation (onboarding), settings, branding, GST, team and permissions, support-access grants, workspace audit log |
| `admin` | Super Admin: overview, tenants, users, plans, integrations, feature flags, CMS, announcements, payments, payouts, reconciliation, webhooks, jobs, audit, system health |
| `public` | Marketing CMS pages, site settings, public plans, sitemap |
| `courses` | Courses, modules, lessons, ordering, quizzes, publishing, students, manual enrolment, assignment grading |
| `learn` | Learner library, course player with drip enforcement, progress, quiz attempts, assignments, reviews, certificates, notifications |
| `media` | Uploads with type and magic-byte checks, storage quotas, signed private delivery, download entitlement |
| `products` | Products, prices, granted items, coupons |
| `storefront` | Public store, product pages, checkout quote, checkout, Razorpay verification, order status, lead forms |
| `commerce` | Payment capture, refunds, invoices, ledger, webhooks, orders, customers, balance and payout requests |
| `workshops` | Live workshops, capacity with row locks, waitlist promotion, Zoom, reminders, attendance, replays, calendar files |
| `consultations` | Availability, offerings, timezone-aware slots, bookings with database-level overlap prevention |
| `community` | Communities, channels, posts, comments, reactions, reports, moderation, blocks, direct messages |
| `marketing` | Contacts, tags, CSV import, campaigns, automation engine, suppression list, unsubscribe, WhatsApp |
| `affiliates` | Programs, click tracking, attribution, commissions |
| `gamification` | Points (idempotent), badges, challenges, habits and streaks, leaderboard |
| `pages` | Landing pages with versioned publishing, themes, custom domains |
| `tools` | Creator tools: field definitions and formulas evaluated by a sandboxed parser |
| `feed` | Short-video feed with visibility rules, likes, comments, unique views, moderation |
| `ai` | Provider abstraction, credit ledger, generators with schema validation, tenant-scoped assistant tools, apply endpoints |
| `support` | Support tickets and admin support desk |

## Multi-tenancy

* Every tenant-owned table has a `tenantId` column with an index, and every query filters on it. Records are always loaded with `findFirst({ where: { id, tenantId } })`, never by id alone, so a guessed id from another workspace returns 404.
* **Dashboard requests** name the workspace with the `X-Tenant` header. `requireTenantStaff` checks for an active staff membership (owner, admin, team member, instructor or moderator), or for a platform support user with an unexpired, owner-granted support grant (read-only permissions).
* **Public requests** resolve the tenant from the URL (`/api/store/:tenantSlug`), a verified custom domain, or a platform subdomain. Suspended workspaces are not served.
* Resources that a product or page references (courses, files, communities, workshops, sessions, media) are checked to belong to the same workspace before they are saved.
* Tenant isolation is covered by tests (`tenancy.test.ts`, `commerce.test.ts` › tenant isolation).

## Identity, roles and permissions

* **Users** are global. One person can be a creator in one workspace and a student in another.
* **Platform roles:** `USER`, `SUPPORT` (read-only admin), `SUPER_ADMIN`.
* **Workspace roles** (`Membership.roles[]`): `OWNER`, `ADMIN`, `TEAM_MEMBER`, `INSTRUCTOR`, `MODERATOR`, `AFFILIATE`, `STUDENT`. Each role maps to a default set of permissions (`src/lib/permissions.ts`). `Membership.permissions[]` grants extra permissions individually.
* Routes declare what they need with `can('courses.write', …)`. The UI hides what the member cannot do, but the API is the enforcement point.
* Buyers become `STUDENT` members automatically when they are granted an entitlement.

## Access control for content: entitlements

`Entitlement` is the single source of truth for "may this user use this resource". It records a resource (course, product, membership, download, community, workshop or consultation), a source (order, subscription, manual or free) and an optional expiry. Payment capture grants entitlements, full refunds revoke them, subscriptions extend them and expiry ends them. Lesson, file, community, workshop and feed access all check entitlements on the server for every request.

## Sessions

* Access token: HS256 JWT, 15 minutes, held in memory by the SPA and sent as `Authorization: Bearer`.
* Refresh token: 48 random bytes, stored as a SHA-256 hash, in an httpOnly `SameSite=Strict` cookie scoped to `/api/auth`. It is rotated on every refresh. Presenting a rotated token revokes the whole token family (theft detection), and concurrent refreshes are resolved by a conditional update.
* Cookie-authenticated endpoints (`/refresh`, `/logout`) require the `X-Requested-With: fetch` header, which a cross-site form cannot send without a CORS preflight.

## Background work

* `enqueueJob(tx, name, payload, idempotencyKey)` writes a job in the caller's transaction.
* Workers claim jobs with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, retry with exponential backoff (up to 5 attempts), and recover jobs locked for more than 10 minutes.
* Sweeps run every 5 minutes. They publish scheduled courses, queue renewal reminders, move ended subscriptions into grace and then expiry, expire entitlements, send scheduled campaigns, advance automation runs, emit abandoned-checkout and inactive-learner events, and queue workshop reminders. Every step is idempotent.
* Run the worker inside the API (default) or as a separate process with `DISABLE_WORKER=1` on the API and `npm run worker`.

## Real time

Socket.IO at `/api/socket.io`. The handshake requires an access token. Clients join rooms (`channel:<id>`, `conversation:<id>`) only after the same access checks the REST API uses, and every user also has a personal room `user:<id>`. The server emits `post:new`, `comment:new`, `message:new` and `inbox:update`.

## Content safety

* Pages (CMS and landing pages) are stored as JSON documents validated against a closed set of block types (`src/lib/blocks.ts`). The renderer outputs text only, with no HTML injection anywhere in the app. URLs must be http(s), and video embeds are limited to YouTube and Vimeo embed URLs in sandboxed iframes.
* Creator tools never run code. Formulas are parsed by a small recursive-descent parser that supports arithmetic, comparisons and whitelisted functions only.
* AI output is validated against the same schemas before it is returned, and it only becomes content through explicit "apply" endpoints that create drafts.

## Web app structure (web/src)

| Path | Area |
|---|---|
| `pages/marketing`, `layouts/MarketingLayout.tsx` | CMS-driven marketing site |
| `pages/auth` | Login (password, email code, Google), signup, verification, reset, onboarding |
| `pages/app` | Creator dashboard (one page per module) with a workspace context that carries permissions |
| `pages/store` | Branded storefront, checkout, order confirmation, workshops, booking, landing pages, tools, feed |
| `pages/learn` | Learner library, course player, workshops, sessions, certificates, affiliate dashboard, account, support |
| `pages/community` | Community feed, comments, reactions, DMs with live updates |
| `pages/admin` | Super Admin console |
| `components/blocks` | Shared block renderer and drag-and-drop editor (CMS and landing pages) |
| `components/ui` | Design-system components (buttons, forms, dialogs, menus, tabs, tables, states) |
