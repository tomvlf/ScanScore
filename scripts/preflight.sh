#!/bin/sh
set -eu
fail(){ echo "FAIL: $*" >&2; exit 1; }
ok(){ echo "OK: $*"; }
command -v docker >/dev/null 2>&1 || fail 'Docker is not installed'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'
[ -f .env ] || fail '.env is missing; run scripts/generate-secrets.sh'
for f in db_owner_password db_runtime_password owner_database_url runtime_database_url secret_pepper qr_encryption_key; do
  p="secrets/$f.txt"; [ -s "$p" ] || fail "$p missing or empty"
done
[ "$(wc -c < secrets/db_owner_password.txt)" -ge 64 ] || fail 'owner password too short'
[ "$(wc -c < secrets/db_runtime_password.txt)" -ge 64 ] || fail 'runtime password too short'
[ "$(wc -c < secrets/qr_encryption_key.txt)" -eq 44 ] || fail 'QR encryption key must be base64 for 32 bytes'
grep -Eq '^ALLOWED_ORIGINS=https://[^ ]+$' .env || fail 'ALLOWED_ORIGINS must be one exact HTTPS origin'
if grep -q 'quiz.example.be' .env; then fail 'replace the example origin'; fi
docker compose config --quiet || fail 'Compose configuration invalid'
docker compose config --format json > /tmp/scanscore-compose.json
python3 scripts/validate-compose-secrets.py /tmp/scanscore-compose.json
ok 'Compose secret wiring and service separation verified'
