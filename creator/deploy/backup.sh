#!/usr/bin/env bash
# Nightly backup: compressed Postgres dump + uploads archive, kept for RETAIN_DAYS.
# Cron (as the app user):  15 2 * * * /var/www/creator/deploy/backup.sh >> /var/log/creator-backup.log 2>&1
# Copy BACKUP_DIR off the server (e.g. `rclone sync` to S3/B2) – a backup on the same disk is not a backup.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/creator}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/www/creator/server/uploads}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$BACKUP_DIR/db-$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
# Verify the dump is readable before pruning older ones
pg_restore --list "$BACKUP_DIR/db-$STAMP.dump" > /dev/null
find "$BACKUP_DIR" -type f -mtime +"$RETAIN_DAYS" -delete
echo "backup ok $STAMP"
