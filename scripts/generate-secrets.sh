#!/bin/sh
set -eu
umask 077
mkdir -p secrets
owner=$(openssl rand -hex 32)
runtime=$(openssl rand -hex 32)
pepper=$(openssl rand -base64 48 | tr -d '\n')
qr=$(openssl rand -base64 32 | tr -d '\n')
printf '%s' "$owner" > secrets/db_owner_password.txt
printf '%s' "$runtime" > secrets/db_runtime_password.txt
printf 'postgresql://scanscore_owner:%s@db:5432/scanscore' "$owner" > secrets/owner_database_url.txt
printf 'postgresql://scanscore_runtime:%s@db:5432/scanscore' "$runtime" > secrets/runtime_database_url.txt
printf '%s' "$pepper" > secrets/secret_pepper.txt
printf '%s' "$qr" > secrets/qr_encryption_key.txt
chmod 600 secrets/*.txt
cat > .env <<'EOT'
ALLOWED_ORIGINS=https://quiz.example.be
EOT
chmod 600 .env
printf '%s\n' 'Secrets generated. Set the exact HTTPS origin in .env.'
