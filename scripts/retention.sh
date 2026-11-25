#!/bin/sh
set -eu
# Daily retention purge, run from host cron as the database owner.
# The app role can only append to audit_events; this script removes
# audit events older than 90 days.
docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U scanscore_owner -d scanscore -v ON_ERROR_STOP=1' <<'SQL'
DELETE FROM audit_events WHERE created_at<now()-interval '90 days';
SQL
