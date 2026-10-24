# API reference

Base path: `/api`. JSON in and out. All 285 endpoints are listed at the end (generated from the route source files).

## Conventions

* **Authentication:** `Authorization: Bearer <accessToken>`. Get a token from `/auth/login`, `/auth/signup` or `/auth/otp/verify`. Access tokens last 15 minutes; renew with `POST /auth/refresh`, which uses the httpOnly refresh cookie and requires the header `X-Requested-With: fetch`.
* **Workspace scope:** dashboard endpoints require `X-Tenant: <workspace id or slug>`. The caller must be an active staff member of that workspace, or a support user with an owner-granted, unexpired support grant (read-only).
* **Permissions:** each dashboard endpoint requires specific permissions (see `src/lib/permissions.ts`). Missing permissions return `403` with `Missing permission: <name>`.
* **Public storefront:** `/api/store/:tenantSlug/...` needs no workspace header. Purchase, registration and booking endpoints require a signed-in user.
* **Money:** integer minor units (paise / cents) plus an ISO currency, e.g. `{ "amount": 99900, "currency": "INR" }` is ₹999.
* **Pagination:** `?page=1&pageSize=20&q=search`. Responses look like `{ items, total, page, pageSize }`.
* **Validation:** request bodies are validated with Zod. Unknown fields are ignored.
* **CSV exports:** `GET /orders?format=csv` and `GET /customers?format=csv`. Cells that start with `= + - @` are escaped to prevent formula injection.

## Errors

```json
{ "message": "Human-readable explanation", "code": "bad_request", "details": { "field": ["problem"] } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | Validation failed or the action is not allowed in the current state |
| 401 | `unauthorized` | Missing, expired or invalid token |
| 403 | `forbidden` | Signed in, but not allowed (role, permission, plan limit, suspension) |
| 404 | `not_found` | Missing, or belongs to another workspace (deliberately indistinguishable) |
| 409 | `conflict` | Duplicate (slug, email, coupon), already owned, slot taken, workshop full |
| 413 | `too_large` | Body over 2 MB (uploads use multipart) |
| 429 | – | Rate limited |
| 503 | `not_configured` | A provider (payments, AI, Zoom) is not configured; nothing is simulated |

## Rate limits (per IP)

| Endpoints | Limit |
|---|---|
| All `/api` | 600 / minute |
| Login, OTP verify, password reset, signup | 30 / 15 minutes |
| Sending codes by email | 8 / 15 minutes |
| Public writes (checkout, lead forms, clicks, tool runs) | 30 / minute |
| AI | 20 / minute |

Rate-limit counters are in memory per process. If you run several API processes, use a shared store (see DEPLOYMENT.md › Scaling).

## Webhooks (inbound)

| Endpoint | Verification |
|---|---|
| `POST /api/webhooks/razorpay` | HMAC-SHA256 of the raw body with the webhook secret (`X-Razorpay-Signature`); deduplicated by `X-Razorpay-Event-Id` |
| `POST /api/webhooks/stripe` | `Stripe-Signature` checked by the Stripe SDK, including the 5-minute timestamp tolerance; deduplicated by event id |

Unsigned or forged requests return 400 and are not stored. Processing failures return 500 so that the provider retries; each event is processed at most once.

## Example: checkout

```http
POST /api/store/asha-yoga/checkout
Authorization: Bearer eyJ…
Content-Type: application/json

{ "priceId": "…", "couponCode": "LAUNCH20", "buyer": { "name": "Ravi Kumar", "country": "IN", "state": "27" }, "visitorId": "…" }
```

```json
{ "orderId": "…", "status": "PENDING", "provider": "RAZORPAY",
  "razorpay": { "keyId": "rzp_live_…", "orderId": "order_…", "amount": 79920, "currency": "INR", "name": "Asha Yoga", "description": "…", "prefill": { … }, "themeColor": "#0f766e" } }
```

After Razorpay Checkout returns, the client calls `POST /api/store/:slug/orders/:orderId/razorpay/verify` with the three `razorpay_*` fields. The server checks the signature, then asks Razorpay's API whether the payment is captured, and only then fulfils. The `payment.captured` webhook does the same independently. Poll `GET /api/store/:slug/orders/:orderId` for the status.

## Endpoints

### `/api/auth` — auth/routes.ts (authRouter)

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `POST /api/auth/verify-email`
- `POST /api/auth/verify-email/resend`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `POST /api/auth/password/change`
- `GET /api/auth/me/export`
- `DELETE /api/auth/me`
- `GET /api/auth/google/status`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`

### `/api/workspaces` — tenants/routes.ts (tenantRouter)

- `GET /api/workspaces/slug-available/:slug`
- `POST /api/workspaces`
- `GET /api/workspaces/current`
- `PATCH /api/workspaces/current`
- `GET /api/workspaces/current/team`
- `POST /api/workspaces/current/team`
- `PATCH /api/workspaces/current/team/:membershipId`
- `DELETE /api/workspaces/current/team/:membershipId`
- `GET /api/workspaces/current/support-access`
- `POST /api/workspaces/current/support-access`
- `DELETE /api/workspaces/current/support-access/:id`
- `GET /api/workspaces/current/audit-logs`

### `/api/admin/support` — support/routes.ts (supportAdminRouter)

- `GET /api/admin/support`
- `GET /api/admin/support/:ticketId`
- `POST /api/admin/support/:ticketId/reply`

### `/api/admin` — admin/routes.ts (adminRouter)

- `GET /api/admin/overview`
- `GET /api/admin/tenants`
- `GET /api/admin/tenants/:id`
- `PATCH /api/admin/tenants/:id/status`
- `PATCH /api/admin/tenants/:id/plan`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PUT /api/admin/plans/:id`
- `GET /api/admin/integrations`
- `PUT /api/admin/integrations/:kind`
- `GET /api/admin/feature-flags`
- `PUT /api/admin/feature-flags/:key`
- `DELETE /api/admin/feature-flags/:key`
- `GET /api/admin/cms/pages`
- `GET /api/admin/cms/pages/:id`
- `POST /api/admin/cms/pages`
- `PUT /api/admin/cms/pages/:id`
- `DELETE /api/admin/cms/pages/:id`
- `GET /api/admin/cms/settings`
- `PUT /api/admin/cms/settings`
- `GET /api/admin/announcements`
- `POST /api/admin/announcements`
- `DELETE /api/admin/announcements/:id`
- `GET /api/admin/audit-logs`
- `GET /api/admin/webhooks`
- `GET /api/admin/jobs`
- `POST /api/admin/jobs/:id/retry`
- `GET /api/admin/system`
- `GET /api/admin/payments`
- `GET /api/admin/payouts`
- `PATCH /api/admin/payouts/:id`
- `GET /api/admin/reconciliation`

### `/api/public` — public/routes.ts (publicRouter)

- `GET /api/public/site`
- `GET /api/public/pages/*slug`
- `GET /api/public/plans`
- `GET /api/public/announcements`
- `GET /api/public/sitemap.xml`

### `/api/public/certificates` — learn/routes.ts (certificatePublicRouter)

- `GET /api/public/certificates/:code`

### `/api/media` — media/routes.ts (mediaRouter)

- `POST /api/media`
- `GET /api/media`
- `GET /api/media/:id/signed-url`
- `DELETE /api/media/:id`
- `GET /api/media/public/:id`
- `GET /api/media/file/:id`
- `GET /api/media/download/:tenantId/:assetId`

### `/api/courses` — courses/routes.ts (coursesRouter)

- `GET /api/courses`
- `POST /api/courses`
- `GET /api/courses/:courseId`
- `PATCH /api/courses/:courseId`
- `POST /api/courses/:courseId/status`
- `DELETE /api/courses/:courseId`
- `POST /api/courses/:courseId/modules`
- `PATCH /api/courses/modules/:moduleId`
- `DELETE /api/courses/modules/:moduleId`
- `POST /api/courses/modules/:moduleId/lessons`
- `PATCH /api/courses/lessons/:lessonId`
- `DELETE /api/courses/lessons/:lessonId`
- `POST /api/courses/lessons/:lessonId/resources`
- `DELETE /api/courses/lessons/:lessonId/resources/:resourceId`
- `PUT /api/courses/:courseId/curriculum/order`
- `PUT /api/courses/lessons/:lessonId/quiz`
- `GET /api/courses/:courseId/students`
- `POST /api/courses/:courseId/enroll`
- `DELETE /api/courses/:courseId/students/:userId`
- `GET /api/courses/:courseId/submissions`
- `PATCH /api/courses/submissions/:submissionId`

### `/api/products` — products/routes.ts (productsRouter)

- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:productId`
- `PATCH /api/products/:productId`
- `POST /api/products/:productId/status`
- `PUT /api/products/:productId/items`
- `POST /api/products/:productId/prices`
- `PATCH /api/products/prices/:priceId`
- `DELETE /api/products/:productId`

### `/api/coupons` — products/routes.ts (couponsRouter)

- `GET /api/coupons`
- `POST /api/coupons`
- `PATCH /api/coupons/:couponId`
- `DELETE /api/coupons/:couponId`

### `/api/orders` — commerce/routes.ts (ordersRouter)

- `GET /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/orders/:orderId/refund`

### `/api/customers` — commerce/routes.ts (customersRouter)

- `GET /api/customers`
- `GET /api/customers/:contactId`

### `/api/finance` — commerce/routes.ts (financeRouter)

- `GET /api/finance/balance`
- `POST /api/finance/payouts`

### `/api/dashboard` — dashboard/routes.ts (dashboardRouter)

- `GET /api/dashboard`
- `GET /api/dashboard/search`

### `/api/learn/workshops` — workshops/routes.ts (myWorkshopsRouter)

- `GET /api/learn/workshops`
- `GET /api/learn/workshops/:workshopId/calendar.ics`

### `/api/learn/bookings` — consultations/routes.ts (myBookingsRouter)

- `GET /api/learn/bookings`
- `POST /api/learn/bookings/:bookingId/reschedule`
- `POST /api/learn/bookings/:bookingId/cancel`

### `/api/learn` — learn/routes.ts (learnRouter)

- `GET /api/learn/library`
- `GET /api/learn/courses/:courseId`
- `GET /api/learn/lessons/:lessonId`
- `POST /api/learn/lessons/:lessonId/progress`
- `POST /api/learn/lessons/:lessonId/quiz`
- `POST /api/learn/lessons/:lessonId/assignment`
- `POST /api/learn/courses/:courseId/review`
- `GET /api/learn/certificates`
- `GET /api/learn/notifications`
- `POST /api/learn/notifications/read`

### `/api/marketing` — marketing/routes.ts (marketingRouter)

- `POST /api/marketing/contacts`
- `PATCH /api/marketing/contacts/:contactId`
- `DELETE /api/marketing/contacts/:contactId`
- `POST /api/marketing/contacts/import`
- `GET /api/marketing/tags`
- `GET /api/marketing/campaigns`
- `POST /api/marketing/campaigns`
- `PUT /api/marketing/campaigns/:campaignId`
- `GET /api/marketing/campaigns/:campaignId/audience`
- `POST /api/marketing/campaigns/:campaignId/schedule`
- `POST /api/marketing/campaigns/:campaignId/cancel`
- `GET /api/marketing/messages`
- `GET /api/marketing/workflows`
- `POST /api/marketing/workflows`
- `PUT /api/marketing/workflows/:workflowId`
- `GET /api/marketing/workflows/:workflowId/executions`
- `DELETE /api/marketing/workflows/:workflowId`
- `GET /api/marketing/suppressions`
- `POST /api/marketing/suppressions`
- `GET /api/marketing/whatsapp`
- `PUT /api/marketing/whatsapp`

### `/api/public/unsubscribe` — marketing/routes.ts (unsubscribeRouter)

- `GET /api/public/unsubscribe`
- `POST /api/public/unsubscribe`

### `/api/workshops` — workshops/routes.ts (workshopsRouter)

- `GET /api/workshops`
- `POST /api/workshops`
- `PUT /api/workshops/:workshopId`
- `POST /api/workshops/:workshopId/publish`
- `POST /api/workshops/:workshopId/cancel`
- `GET /api/workshops/:workshopId/registrations`
- `POST /api/workshops/:workshopId/attendance`
- `POST /api/workshops/:workshopId/recording`
- `GET /api/workshops/integrations/zoom`
- `PUT /api/workshops/integrations/zoom`

### `/api/consultations` — consultations/routes.ts (consultationsRouter)

- `GET /api/consultations/offerings`
- `POST /api/consultations/offerings`
- `PUT /api/consultations/offerings/:offeringId`
- `GET /api/consultations/availability`
- `PUT /api/consultations/availability`
- `GET /api/consultations/bookings`
- `PATCH /api/consultations/bookings/:bookingId`

### `/api/community-admin` — community/routes.ts (communityAdminRouter)

- `GET /api/community-admin`
- `POST /api/community-admin`
- `PATCH /api/community-admin/:communityId`
- `POST /api/community-admin/:communityId/channels`
- `DELETE /api/community-admin/channels/:channelId`
- `GET /api/community-admin/reports`
- `POST /api/community-admin/reports/:reportId`
- `GET /api/community-admin/analytics`

### `/api/community` — community/routes.ts (communityRouter)

- `GET /api/community/store/:tenantSlug`
- `POST /api/community/:communityId/join`
- `GET /api/community/:communityId`
- `GET /api/community/channels/:channelId/posts`
- `POST /api/community/channels/:channelId/posts`
- `PATCH /api/community/posts/:postId`
- `DELETE /api/community/posts/:postId`
- `GET /api/community/posts/:postId/comments`
- `POST /api/community/posts/:postId/comments`
- `DELETE /api/community/comments/:commentId`
- `POST /api/community/posts/:postId/reactions`
- `POST /api/community/report`
- `POST /api/community/block`
- `GET /api/community/messages/:tenantId`
- `POST /api/community/messages/:tenantId`
- `GET /api/community/conversations/:conversationId`
- `POST /api/community/conversations/:conversationId`

### `/api/affiliates` — affiliates/routes.ts (affiliatesAdminRouter)

- `GET /api/affiliates`
- `PATCH /api/affiliates/:affiliateId`
- `PUT /api/affiliates/rules/:productId`
- `GET /api/affiliates/commissions`
- `PATCH /api/affiliates/commissions/:commissionId`

### `/api/affiliate` — affiliates/routes.ts (affiliateSelfRouter)

- `GET /api/affiliate`

### `/api/gamification` — gamification/routes.ts (gamificationAdminRouter)

- `GET /api/gamification/badges`
- `POST /api/gamification/badges`
- `POST /api/gamification/badges/:badgeId/award`
- `POST /api/gamification/points`
- `POST /api/gamification/challenges`

### `/api/engage` — gamification/routes.ts (engageRouter)

- `GET /api/engage/:tenantId`
- `POST /api/engage/:tenantId/challenges/:challengeId/complete`
- `GET /api/engage/:tenantId/habits`
- `POST /api/engage/:tenantId/habits`
- `POST /api/engage/:tenantId/habits/:habitId/check`
- `DELETE /api/engage/:tenantId/habits/:habitId`

### `/api/pages` — pages/routes.ts (pagesRouter)

- `GET /api/pages`
- `POST /api/pages`
- `GET /api/pages/:pageId`
- `PUT /api/pages/:pageId`
- `POST /api/pages/:pageId/publish`
- `POST /api/pages/:pageId/unpublish`
- `POST /api/pages/:pageId/versions/:versionId/restore`
- `POST /api/pages/:pageId/duplicate`
- `DELETE /api/pages/:pageId`
- `GET /api/pages/themes/all`
- `POST /api/pages/themes/all`
- `POST /api/pages/themes/:themeId/activate`
- `GET /api/pages/domains/all`
- `POST /api/pages/domains/all`
- `POST /api/pages/domains/:domainId/verify`
- `DELETE /api/pages/domains/:domainId`

### `/api/domains` — pages/routes.ts (domainLookupRouter)

- `GET /api/domains`
- `GET /api/domains/tls-allowed`

### `/api/ai` — ai/routes.ts (aiRouter)

- `GET /api/ai/usage`
- `POST /api/ai/generate`
- `POST /api/ai/chat`
- `POST /api/ai/apply/course-outline`
- `POST /api/ai/apply/landing-page`

### `/api/tools` — tools/routes.ts (toolsAdminRouter)

- `GET /api/tools`
- `POST /api/tools`
- `PUT /api/tools/:toolId`
- `POST /api/tools/preview`
- `GET /api/tools/:toolId/submissions`
- `DELETE /api/tools/:toolId`

### `/api/feed` — feed/routes.ts (feedAdminRouter)

- `GET /api/feed`
- `PATCH /api/feed/:postId`
- `PUT /api/feed/settings`

### `/api/support` — support/routes.ts (supportRouter)

- `GET /api/support`
- `POST /api/support`
- `GET /api/support/:ticketId`
- `POST /api/support/:ticketId/messages`

### `/api/store/:tenantSlug/workshops` — workshops/routes.ts (workshopsPublicRouter)

- `GET /api/store/:tenantSlug/workshops`
- `GET /api/store/:tenantSlug/workshops/:workshopId`
- `POST /api/store/:tenantSlug/workshops/:workshopId/register`
- `POST /api/store/:tenantSlug/workshops/:workshopId/cancel`

### `/api/store/:tenantSlug/consultations` — consultations/routes.ts (consultationsPublicRouter)

- `GET /api/store/:tenantSlug/consultations`
- `GET /api/store/:tenantSlug/consultations/:offeringId/slots`
- `POST /api/store/:tenantSlug/consultations/:offeringId/book`

### `/api/store/:tenantSlug/affiliates` — affiliates/routes.ts (affiliatesPublicRouter)

- `POST /api/store/:tenantSlug/affiliates/click`
- `POST /api/store/:tenantSlug/affiliates/join`

### `/api/store/:tenantSlug/pages` — pages/routes.ts (pagesPublicRouter)

- `GET /api/store/:tenantSlug/pages/:pageSlug`

### `/api/store/:tenantSlug/tools` — tools/routes.ts (toolsPublicRouter)

- `GET /api/store/:tenantSlug/tools/:toolSlug`
- `POST /api/store/:tenantSlug/tools/:toolSlug/run`

### `/api/store/:tenantSlug/feed` — feed/routes.ts (feedPublicRouter)

- `GET /api/store/:tenantSlug/feed`
- `POST /api/store/:tenantSlug/feed/:postId/view`
- `POST /api/store/:tenantSlug/feed/:postId/like`
- `GET /api/store/:tenantSlug/feed/:postId/comments`
- `POST /api/store/:tenantSlug/feed/:postId/comments`
- `POST /api/store/:tenantSlug/feed/:postId/report`
- `POST /api/store/:tenantSlug/feed/upload`
- `POST /api/store/:tenantSlug/feed`

### `/api/store/:tenantSlug` — storefront/routes.ts (storefrontRouter)

- `GET /api/store/:tenantSlug`
- `GET /api/store/:tenantSlug/products/:productSlug`
- `POST /api/store/:tenantSlug/checkout/quote`
- `POST /api/store/:tenantSlug/checkout`
- `POST /api/store/:tenantSlug/orders/:orderId/razorpay/verify`
- `GET /api/store/:tenantSlug/orders/:orderId`
- `POST /api/store/:tenantSlug/leads`

### `/api/webhooks` — commerce/webhooks.ts (webhooksRouter)

- `POST /api/webhooks/razorpay`
- `POST /api/webhooks/stripe`
