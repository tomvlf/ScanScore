#!/bin/sh
set -eu
[ $# -eq 1 ] || { echo 'Usage: ./scripts/purge-room.sh <room-name>' >&2; exit 1; }
# Privacy purge as the database owner: deletes a room and everything that
# cascades from it (players, games, quizzes, images, sessions, tickets).
# Audit rows survive with room_id set to null until the retention purge.
docker compose exec -T -e PURGE_ROOM="$1" db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U scanscore_owner -d scanscore -v ON_ERROR_STOP=1 -v room="$PURGE_ROOM"' <<'SQL'
DELETE FROM rooms WHERE login_name=lower(btrim(:'room'));
SQL
