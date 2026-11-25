#!/bin/sh
set -eu
umask 077
owner=$(openssl rand -hex 32)
runtime=$(openssl rand -hex 32)
pepper=$(openssl rand -base64 48 | tr -d '\n')
qr=$(openssl rand -base64 32 | tr -d '\n')
backup=$(openssl rand -base64 32 | tr -d '\n')
cat > .env <<EOT
ALLOWED_ORIGINS=https://quiz.example.be
DB_OWNER_PASSWORD=$owner
DB_RUNTIME_PASSWORD=$runtime
RUNTIME_DATABASE_URL=postgresql://scanscore_runtime:$runtime@db:5432/scanscore
SECRET_PEPPER=$pepper
QR_ENCRYPTION_KEY=$qr
BACKUP_PASSPHRASE=$backup
EOT
chmod 600 .env
printf '%s\n' 'Environment variables generated in .env. Set the exact HTTPS origin there.'
