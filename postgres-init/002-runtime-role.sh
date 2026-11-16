#!/bin/sh
set -eu
password=${DB_RUNTIME_PASSWORD:?Missing DB_RUNTIME_PASSWORD}
case "$password" in ''|*[!A-Fa-f0-9]*) echo 'Runtime password must be hexadecimal' >&2; exit 1;; esac
[ "${#password}" -ge 64 ] || { echo 'Runtime password is too short' >&2; exit 1; }
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=p="$password" <<'SQL'
CREATE ROLE scanscore_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD :'p';
ALTER ROLE scanscore_runtime SET statement_timeout='10s';
ALTER ROLE scanscore_runtime SET lock_timeout='3s';
ALTER ROLE scanscore_runtime SET idle_in_transaction_session_timeout='15s';
ALTER ROLE scanscore_runtime SET search_path TO public, pg_catalog;
REVOKE ALL ON DATABASE scanscore FROM scanscore_runtime;
GRANT CONNECT ON DATABASE scanscore TO scanscore_runtime;
SQL
