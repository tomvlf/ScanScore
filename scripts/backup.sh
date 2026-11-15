#!/bin/sh
set -eu
mkdir -p backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PASSWORD=$(cat secrets/db_owner_password.txt)
docker compose exec -T -e PGPASSWORD="$PASSWORD" db pg_dump -U scanscore_owner -d scanscore --format=custom --no-owner --no-acl > "backups/scanscore-$STAMP.dump"
sha256sum "backups/scanscore-$STAMP.dump" > "backups/scanscore-$STAMP.dump.sha256"
find backups -type f -mtime +30 -delete
