# Implementation Roadmap

The MVP is planned for a small team: 2 backend engineers, 1 web engineer, 1 Flutter engineer,
1 designer for templates and frames, and part-time QA. Durations are estimates for that team. Each
phase ends with something that can be released.

```
Phase 0  Foundations                 ██                       weeks 1–2
Phase 1  Auth & business setup         ███                    weeks 3–5
Phase 2  Template rendering pipeline      ████                weeks 5–8
Phase 3  Daily generator & sharing            ████            weeks 9–12   ← public MVP launch
Phase 4  Editor & content library                 ███         weeks 13–15
Phase 5  Video & reels                               ████     weeks 16–19
Phase 6  Integrations & growth tools                    █████ weeks 20–24
```

## Phase 0: Foundations (weeks 1–2)

- Monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `apps/mobile` (Flutter), `packages/poster-engine`
  (this folder), `packages/template-spec` (JSON Schema + TypeScript types generated from it).
- Infrastructure as code (Terraform): PostgreSQL (managed), Redis, R2 buckets with a CDN, container
  hosting for the API and workers, secrets manager.
- CI: lint, unit tests, schema migrations (`db/schema.sql` split into migrations), container images,
  preview deployments.
- Observability: OpenTelemetry tracing, Sentry, structured logs.

**Exit:** an empty API and web app deployed to staging through CI.

## Phase 1: Auth & business setup (weeks 3–5)

- Phone OTP login (MSG91 or WhatsApp OTP) plus Google sign-in. JWT access and refresh tokens.
- Tenants, memberships, roles. Row-level security enabled from day one.
- "My Business": profile form, industry and sub-category picker, social handles.
- Logo upload: validation, trim, automatic light/dark variants, dominant colour extraction, brand
  colour suggestions.
- Plans table, free plan by default.

**Exit:** a user can sign up on web and mobile and complete their brand kit.

## Phase 2: Template rendering pipeline (weeks 5–8)

- Template spec and validator (**done in this folder**: `schemas/`, `src/template/`).
- Image composer with sharp (**done**: `src/render/`), packaged as a worker image with fonts.
- BullMQ render queue, content-hash cache in R2, Redis deduplication lock, WebSocket progress.
- Template admin (internal): upload artwork, edit the layer JSON with a live preview, publish a
  version, CI checks with worst-case profiles.
- Frame library: 15–20 footer and header frames, each tested with long names and missing fields.
- Template catalogue API with language, style and category filters, keyset pagination and Redis
  caching.

**Exit:** p95 render time under 800 ms for a 1080 px post; 300 templates and 15 frames in the
catalogue.

## Phase 3: Daily generator & sharing (weeks 9–12): public MVP

- Festival calendar: `festivals` + yearly `festival_occurrences` for India (national, religious,
  jayantis, memorial and commercial days), with names and greetings in 10 languages; staff review
  workflow.
- Nightly feed builder (Today / Tomorrow / Upcoming per language and industry) stored in Redis.
- Feed UI with thumbnail + frame overlay (no render needed), full render on tap.
- One-tap share: native share sheet (WhatsApp, Status, Instagram), download, share logging.
- Morning push notification and pre-warming for active users.
- Razorpay subscriptions (UPI autopay) with the free plan watermark and daily download limits.

**Exit:** public launch on Android, iOS and web; 1,500+ festival templates for the next 90 days.

## Phase 4: Editor & content library (weeks 13–15)

- Fabric.js editor on web and a simplified Flutter editor: edit text, move or hide elements, change
  colours, swap photos, change frames, all saved as overrides.
- "Create Your Today's Post" with the three filters for business (non-festival) content: promotional,
  educational, emotional, lead generation and showcase templates per niche.
- Content library: history of generated creatives, re-download, re-edit, uploaded assets.
- Agency accounts: several businesses per login, business switcher.

**Exit:** at least 30% of downloads include an edit, or the editor is simplified based on usage.

## Phase 5: Video & reels (weeks 16–19)

- Overlay reels: FFmpeg worker that overlays the frame PNG (rendered by this engine) onto MP4
  templates; queue, quotas and progress.
- Animated reels with Remotion for real-estate showcases (photos, price, features, music synced to
  beat markers).
- Music library with licences recorded per track.

**Exit:** p95 render time under 15 s for a 15 s 1080×1920 overlay reel; video limited to paid plans.

## Phase 6: Integrations & growth tools (weeks 20–24)

- Google Business Profile: OAuth, location picker, scheduled posts, review sync and replies,
  performance metrics.
- Meta: Facebook Page and Instagram Business publishing and scheduling; LinkedIn page posts.
- Microsite builder with lead capture, click-to-WhatsApp and custom domains.
- Digital business card (vCard + QR), quotation and invoice maker, WhatsApp sticker packs.

**Exit:** Google and Meta app reviews approved; scheduled posts publish within ±2 minutes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong festival dates (lunar calendar) | Yearly import from a verified panchang + staff verification flag; show nothing rather than a wrong date |
| Regional script rendering errors | Pango/HarfBuzz shaping; CI renders each template in every listed language and a native speaker reviews new fonts |
| Morning traffic spike | Content-hash deduplication, pre-warming, workers autoscaled on queue depth, CDN for everything already rendered |
| Meta/Google API approval delays | Start app review in phase 3; native share sheet works without any approval |
| Template supply | Frames multiply the catalogue (N templates × M frames); designer tooling in phase 2 is a priority |
| Copyright of artwork, fonts and music | Licensed or own artwork only; OFL fonts; licence recorded per music track |
