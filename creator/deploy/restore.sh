#!/usr/bin/env bash
# Restore a backup into an EMPTY database (test this regularly on a staging server).
#   ./restore.sh /var/backups/creator/db-20261024T021500Z.dump /var/backups/creator/uploads-20261024T021500Z.tar.gz
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DUMP="$1"; UPLOADS="${2:-}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/www/creator/server/uploads}"
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$DUMP"
if [ -n "$UPLOADS" ]; then tar -xzf "$UPLOADS" -C "$(dirname "$UPLOAD_DIR")"; fi
echo "restore complete – run 'npx prisma migrate deploy' if the code is newer than the backup"
