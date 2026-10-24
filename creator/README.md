# YJ Creator Studio – creator business platform

A multi-tenant, white-label platform where creators, coaches and educators run their business: courses, live workshops, paid communities, 1:1 sessions, digital products, a branded storefront with Indian and international payments, CRM and marketing automation, affiliates, landing pages, creator tools, a short-video feed and an AI assistant. A Super Admin console runs the platform.

It is an original product with comparable functionality to creator platforms such as TagMango. It uses none of their branding, assets, code or APIs. The brand name is a placeholder: set `BRAND_NAME` (API), `VITE_BRAND_NAME` (web) and the CMS site settings.

This lives in `creator/` next to the existing YJTechnosoft website and billing suite, which is untouched (see [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md)).

| Layer | Technology |
|---|---|
| Web | React 18, Vite 6, TypeScript, Tailwind CSS 3, shadcn-style components (Radix), TanStack Query, Recharts, Lucide |
| API | Node 22, Express 5, TypeScript, Zod validation, Prisma 6 |
| Database | PostgreSQL 16 (14+), 3 migrations, 93 tables, an exclusion constraint against double bookings |
| Jobs | Postgres-backed queue (transactional outbox) plus periodic sweeps |
| Real time | Socket.IO, with the same authorization as the REST API |
| Payments | Razorpay (INR) and Stripe (other currencies), verified webhooks |
| AI | Anthropic (default `claude-opus-5-5`) or OpenAI, behind one interface |

## Quick start (development)

Prerequisites: Node 20+, PostgreSQL 14+.

```bash
# 1. Database
sudo -u postgres psql -c "CREATE USER creator WITH PASSWORD 'creator' CREATEDB;"
sudo -u postgres createdb -O creator creator_dev
sudo -u postgres psql creator_dev -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"   # superuser-only extension

# 2. API
cd creator/server
cp .env.example .env            # set DATABASE_URL, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
npm install
npx prisma migrate deploy
npm run db:seed -- --demo       # plans, CMS pages, Super Admin, plus a labelled demo workspace
npm run dev                     # http://localhost:4000

# 3. Web (second terminal)
cd creator/web
npm install
npm run dev                     # http://localhost:5174 (proxies /api to :4000)
```

Without SMTP configured, development mode shows email codes in a toast and logs them on the API console. Demo logins (only with `--demo`): `creator@demo.test` / `DemoPass123` and `student@demo.test` / `DemoPass123`. The demo store is at `/s/demo-yoga`.

## Tests

```bash
cd creator/server && npm test        # 73 API/integration tests against a real Postgres (creator_test database)
cd creator/web && npm run typecheck  # strict TypeScript
cd creator/web && npm run test:e2e   # Playwright browser test of the core flow (API + web must be running)
```

See [docs/TESTING.md](docs/TESTING.md) for what each suite covers.

## Repository layout

```
creator/
  server/            Express API
    prisma/          schema, migrations, seed
    src/modules/     one folder per domain (auth, tenants, admin, courses, commerce, …)
    src/services/    cross-cutting services (email, storage, jobs, realtime, payments, …)
    src/jobs/        background job handlers and time-based sweeps
    test/            Vitest + Supertest integration tests
  web/               React app (marketing site, dashboard, storefront, learner area, admin)
    e2e/             Playwright end-to-end test
  deploy/            Nginx, Caddy, PM2, backup and restore scripts
  docker-compose.yml Postgres + API + web
  docs/              documentation (below)
```

## Documentation

| Document | Contents |
|---|---|
| [GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md) | What existed in the repository, decisions taken, deviations from the brief |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, tenancy, auth, permissions, data flows, jobs, real time |
| [API.md](docs/API.md) | Conventions, authentication rules, errors, and all 285 endpoints |
| [PAYMENTS.md](docs/PAYMENTS.md) | Checkout, verification, tax/GST, fees, ledger, refunds, subscriptions, payouts |
| [AFFILIATES.md](docs/AFFILIATES.md) | Attribution and commission rules |
| [METRICS.md](docs/METRICS.md) | Definitions of every dashboard number |
| [PROVIDERS.md](docs/PROVIDERS.md) | Setting up Razorpay, Stripe, SMTP, Google, WhatsApp, Zoom, AI, domains |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Ubuntu VPS (PM2 + Nginx), Docker Compose, TLS, backups, monitoring, scaling |
| [SECURITY.md](docs/SECURITY.md) | Security controls, data protection, key rotation, known limits |
| [TESTING.md](docs/TESTING.md) | Test suites and how to run them |
| [FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) | Status of every requested feature: implemented, tested, pending, externally dependent |
