# Deployment

Requirements: Node 22, PostgreSQL 14+ with the `btree_gist` extension, a domain with DNS access, SMTP, and payment provider keys.

## Option A: Ubuntu VPS with PM2 and Nginx

```bash
# packages
sudo apt update && sudo apt install -y postgresql nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2

# database (btree_gist must be created by a superuser)
sudo -u postgres psql -c "CREATE USER creator WITH PASSWORD '<strong password>';"
sudo -u postgres createdb -O creator creator
sudo -u postgres psql creator -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"

# app
sudo mkdir -p /srv/creator && sudo chown $USER /srv/creator
git clone <repo> /srv/creator/src && cd /srv/creator/src/creator
cd server && cp .env.example .env && nano .env   # NODE_ENV=production and all secrets (see below)
npm ci && npx prisma generate && npm run build
npx prisma migrate deploy && npm run db:seed      # never pass --demo in production
cd ../web && cp .env.example .env && npm ci && npm run build

# processes (API + separate worker)
cd .. && pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup

# web server and TLS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/creator   # edit server_name and paths
sudo ln -s /etc/nginx/sites-available/creator /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com -d '*.example.com'      # wildcard needs a DNS challenge
```

Production secrets: generate each with `openssl rand -hex 32`. You need `JWT_ACCESS_SECRET`, `MEDIA_SIGNING_SECRET` and `INTEGRATION_ENCRYPTION_KEY`. The API refuses to start in production with missing or development values.

## Option B: Docker Compose

```bash
cd creator
cp server/.env.example server/.env   # edit
docker compose up -d --build
docker compose exec api node dist/prisma/seed.js   # plans, CMS pages, Super Admin (migrations run on start)
```

Put Caddy (`deploy/Caddyfile`) in front for automatic HTTPS, including on-demand certificates for verified custom domains.

## Updates

```bash
git pull && cd creator/server && npm ci && npm run build && npx prisma migrate deploy && pm2 reload all
cd ../web && npm ci && npm run build
```

Migrations are forward-only. Take a backup before every deploy that contains a migration.

## Backups

* `deploy/backup.sh` writes a compressed `pg_dump` plus a tarball of the upload directory, and keeps 14 days of them. Schedule it nightly: `15 2 * * * /srv/creator/src/creator/deploy/backup.sh >> /var/log/creator-backup.log 2>&1`.
* Copy backups **off the server** (for example `rclone` to S3 or B2). A backup on the same disk is not a backup.
* `deploy/restore.sh <dump> [uploads.tgz]` restores both. Rehearse a restore into a staging database every quarter.

## Monitoring

* `GET /api/health` returns 200 when the database is reachable, otherwise 503. Point an uptime monitor at it.
* Logs are JSON from pino (`pm2 logs`). Ship them to your log service.
* Admin › Webhooks & jobs shows failed webhooks and failed or dead jobs, with retry buttons.
* Admin › Payments › Reconciliation should show no mismatches before payouts.

## Scaling notes

The default set-up runs **one API process plus one worker**. Before running more API instances:
* Socket.IO needs sticky sessions and the Redis adapter.
* The in-memory rate limiter must move to a shared store (Redis).
* Uploads must move to shared or object storage.
The job queue already supports multiple workers (it uses `FOR UPDATE SKIP LOCKED`).
