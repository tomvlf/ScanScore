#!/bin/sh
set -eu
fail(){ echo "FAIL: $*" >&2; exit 1; }
ok(){ echo "OK: $*"; }
command -v docker >/dev/null 2>&1 || fail 'Docker is not installed'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is unavailable'
[ -f .env ] || fail '.env is missing; run scripts/generate-secrets.sh'
for key in DB_OWNER_PASSWORD DB_RUNTIME_PASSWORD RUNTIME_DATABASE_URL SECRET_PEPPER QR_ENCRYPTION_KEY; do
  grep -Eq "^${key}=.+$" .env || fail "$key is missing or empty in .env"
done
grep -Eq '^DB_OWNER_PASSWORD=[A-Fa-f0-9]{64,}$' .env || fail 'owner password must be at least 64 hexadecimal characters'
grep -Eq '^DB_RUNTIME_PASSWORD=[A-Fa-f0-9]{64,}$' .env || fail 'runtime password must be at least 64 hexadecimal characters'
grep -Eq '^QR_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$' .env || fail 'QR encryption key must be base64 for 32 bytes'
grep -Eq '^ALLOWED_ORIGINS=https://[^ ]+$' .env || fail 'ALLOWED_ORIGINS must be one exact HTTPS origin'
if grep -q 'quiz.example.be' .env; then fail 'replace the example origin'; fi
docker compose --profile test config --quiet || fail 'Compose configuration invalid'
docker compose --profile test config --format json | python3 scripts/validate-compose-env.py
ok 'Compose environment wiring and service separation verified'
