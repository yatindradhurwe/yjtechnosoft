# Security

This document describes the controls in place. It is **not** a certification or a compliance claim. No external audit or penetration test has been done; plan one before handling real customer money at scale.

## Controls

| Area | Control |
|---|---|
| Passwords | argon2id; minimum 8 characters; the account locks for 15 minutes after 5 failed attempts; responses don't reveal whether an email exists |
| One-time codes | 6 digits, stored as SHA-256 hashes, 10-minute expiry, attempt-limited, single use (atomic) |
| Sessions | 15-minute access JWT held in memory only. The refresh token is an httpOnly, Secure, SameSite=Strict cookie scoped to `/api/auth`, rotated on every use; reuse revokes the whole token family. Password reset, suspension and deleting the account end all sessions |
| CSRF | Cookie endpoints require the `X-Requested-With: fetch` header, plus a SameSite=Strict cookie. The Google OAuth flow uses a `state` cookie |
| Tenancy | Every tenant-owned row has a `tenantId`. Dashboard routes check membership and then a specific permission. Records are always loaded by `(id, tenantId)`, and referenced ids are validated against the same tenant. Tests try cross-tenant reads, writes and references |
| Authorisation | Role-based permissions plus per-member extra grants. Content access is decided by entitlements on the server for every request, including signed media URLs and Socket.IO rooms |
| Platform staff | Super Admin actions are always audited. Support staff are read-only and can only enter a workspace through a time-limited grant from its owner. There is no impersonation |
| Payments | Paid status is only set by verified webhooks (HMAC on the raw body) or by a server-side lookup with the provider. Amounts are checked; processing is idempotent (a unique event id plus conditional updates); refunds apply only once the provider confirms them |
| Input | Every body and query is validated with Zod. Page content is structured blocks (no HTML or JS). Creator-tool formulas use a sandboxed arithmetic parser, never `eval` |
| Uploads | Allow-listed types checked by magic bytes, size limits, random file names, private files served only through signed, expiring URLs |
| Secrets | Read only from environment variables or AES-256-GCM-encrypted integration records; never sent to the browser. The API refuses to start in production with development secrets |
| HTTP | Helmet security headers, strict CORS allow-list, request size limits, rate limits on auth, OTP, checkout, posting and clicks |
| Messaging | Marketing email and WhatsApp only go to contacts who have consented; suppression list; one-click unsubscribe |
| Audit | Security-relevant actions are written to `AuditLog` with actor, tenant, IP and before/after values |
| Data | Users can export their data (`GET /api/auth/me/export`) and delete their account (the profile is anonymised and sessions are ended; orders and invoices are kept as tax law requires, and creators remain responsible for their own CRM records) |

## Data protection (India)

The platform is built to support obligations under the Digital Personal Data Protection Act, 2023: purpose-limited collection, consent flags for marketing, access and export, erasure, and audit trails. Operators must still publish an accurate privacy notice, appoint a grievance contact, sign data processing agreements with providers, and decide on data residency (host the database in an Indian region if required). Get legal advice; this software does not make you compliant on its own.

Card data never touches the platform: Razorpay and Stripe host the payment pages and widgets.

## Key rotation

* `JWT_ACCESS_SECRET`: rotating it signs everyone out within 15 minutes. Refresh sessions continue.
* `MEDIA_SIGNING_SECRET`: rotating it invalidates outstanding media links, which are reissued on the next page load.
* `INTEGRATION_ENCRYPTION_KEY`: stored integration secrets must be re-entered after rotating it, because there is no dual-key re-encryption yet.
* Provider keys and webhook secrets: rotate them in the provider dashboard and in the environment or Admin › Integrations.

## Known limits

* Rate limits are held in memory per process; use a shared store when scaling out.
* There is no two-factor authentication for creators or admins yet. Make it a priority for Super Admin accounts.
* There is no malware scanning of uploads.
* Uploaded video is served as plain files with signed URLs. There is no DRM, and determined users can download it.
* There is no automated dependency or SAST scanning in CI yet.

## Reporting

Report vulnerabilities privately to the operator's security contact (set it in the CMS contact page). Do not open public issues.
