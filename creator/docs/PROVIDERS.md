# Provider set-up

Credentials come from **environment variables**, or from **Admin › Integrations**. Integration secrets are stored encrypted with AES-256-GCM under `INTEGRATION_ENCRYPTION_KEY` and are never returned to a browser. When both exist, the stored integration is used. A provider that is not configured is reported as "not configured", and the feature that depends on it refuses with `503 not_configured` instead of pretending to work.

Payments, email and AI are configured **platform-wide**. WhatsApp and Zoom are configured **per workspace** (Workspace › Integrations).

Status: the code paths for every provider below are covered by tests against mocked provider HTTP APIs that use real signature algorithms. They have **not** been tested against live provider accounts in this repository. Test each one in the provider's sandbox before going live.

## Razorpay (INR)

1. Dashboard › Account & Settings › API keys: generate a key and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use test keys (`rzp_test_…`) first.
2. Dashboard › Webhooks › Add: URL `https://<API host>/api/webhooks/razorpay`, with a strong secret in `RAZORPAY_WEBHOOK_SECRET`.
   Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
3. Payment capture must be **automatic** (Dashboard › Payment capture settings). The platform only fulfils captured payments.

## Stripe (international currencies)

1. Set `STRIPE_SECRET_KEY` (`sk_test_…` first).
2. Developers › Webhooks › Add endpoint: `https://<API host>/api/webhooks/stripe`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`.
3. Local testing: `stripe listen --forward-to localhost:4000/api/webhooks/stripe`.

## Email (SMTP)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` and `EMAIL_FROM`. Any SMTP service works (Amazon SES, Resend, Postmark, Brevo, Zoho). Set up SPF, DKIM and DMARC for the sending domain. Marketing emails carry an unsubscribe link and a `List-Unsubscribe` header.
Without SMTP: in development, codes are returned to the UI and logged. In production, emails are recorded as `SKIPPED` and sign-up cannot complete, so configure SMTP before launch.

## Google sign-in

Google Cloud Console › APIs & Services › Credentials › OAuth client (Web):
* Authorised redirect URI: `https://<API host>/api/auth/google/callback` (built from `API_URL`).
* Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The button is hidden while these are unset.

## WhatsApp (Meta Cloud API, per workspace)

1. Meta Business › WhatsApp › API set-up: get the phone number ID and a **permanent system-user access token**.
2. Create and get approval for message **templates**. The platform only sends approved templates, which is what WhatsApp requires for business-initiated messages.
3. In Workspace › Integrations › WhatsApp, enter the phone number ID, access token and app secret.
4. Messages go only to contacts who have given WhatsApp consent. Inbound messages and delivery-status webhooks are not implemented yet.

## Zoom (per workspace)

1. Zoom App Marketplace › Develop › Build App › **Server-to-Server OAuth**. Scopes: `meeting:write:admin` (or `meeting:write:meeting:admin` in the granular scope model).
2. Enter the account ID, client ID and client secret in Workspace › Integrations › Zoom.
3. Workshops with "Create Zoom meeting" then get a meeting created automatically. The join link is shown only to registered attendees.

## AI assistant

* `AI_PROVIDER=anthropic` (default) with `ANTHROPIC_API_KEY`, and optionally `AI_MODEL` (default `claude-opus-5-5`).
* `AI_PROVIDER=openai` with `OPENAI_API_KEY` and `AI_MODEL`.
* Usage is metered in credits; each plan sets a monthly allowance. Requests are refused once a workspace has no credits left.
* AI output is always saved as a **draft** that the creator reviews and applies.

## Custom domains

* Creators add a domain in Workspace › Domains and create the DNS records shown: a TXT record for verification and a CNAME pointing to `PLATFORM_DOMAIN`.
* TLS: the recommended set-up is Caddy with on-demand TLS (`deploy/Caddyfile`). Caddy asks `GET /api/domains/tls-allowed?domain=` before issuing a certificate, so certificates are only issued for verified domains.
* With Nginx, issue certificates per domain with certbot.

## Not implemented yet (configuration fields exist, code does not)

* **S3 / Supabase Storage**: uploads are stored on local disk (`UPLOAD_DIR`) and served through signed, expiring URLs. Back up the upload directory, or mount object storage at that path.
* **Mux / Cloudflare Stream**: videos are uploaded and streamed as files with signed URLs. There is no transcoding, adaptive streaming or DRM yet. Lessons can embed YouTube or Vimeo links.
