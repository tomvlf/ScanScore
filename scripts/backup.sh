#!/bin/sh
set -eu
umask 077
passphrase=${BACKUP_PASSPHRASE:-}
if [ -z "$passphrase" ] && [ -f .env ]; then
 passphrase=$(sed -n 's/^BACKUP_PASSPHRASE=//p' .env | head -n 1)
fi
[ -n "$passphrase" ] || { echo 'BACKUP_PASSPHRASE is missing; add it to .env (openssl rand -base64 32)' >&2; exit 1; }
export BACKUP_PASSPHRASE="$passphrase"
mkdir -p backups
chmod 700 backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
tmp="backups/.scanscore-$STAMP.dump.tmp"
trap 'rm -f "$tmp"' EXIT
docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U scanscore_owner -d scanscore --format=custom --no-owner --no-acl' > "$tmp"
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -in "$tmp" -out "backups/scanscore-$STAMP.dump.enc"
sha256sum "backups/scanscore-$STAMP.dump.enc" > "backups/scanscore-$STAMP.dump.enc.sha256"
find backups -type f -mtime +30 -delete
