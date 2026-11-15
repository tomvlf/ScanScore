BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE rooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar(40) NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
 title varchar(80) NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 80), host_secret_hash text NOT NULL,
 active_round_id uuid, question integer NOT NULL DEFAULT 1 CHECK(question BETWEEN 1 AND 10000), mode varchar(10) NOT NULL DEFAULT 'fixed' CHECK(mode IN ('fixed','places')),
 fixed_points integer NOT NULL DEFAULT 1 CHECK(fixed_points BETWEEN -1000 AND 1000), place_points integer[] NOT NULL DEFAULT ARRAY[5,3,1],
 once_per_question boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE display_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE, token_hash bytea NOT NULL UNIQUE, label varchar(60) NOT NULL DEFAULT 'Display', expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE, name varchar(60) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60), ordinal integer NOT NULL CHECK(ordinal>0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(room_id,ordinal));
ALTER TABLE rooms ADD CONSTRAINT rooms_active_round_fk FOREIGN KEY(active_round_id) REFERENCES rounds(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE, name varchar(60) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60), kind varchar(10) NOT NULL CHECK(kind IN ('person','team')), qr_hash bytea NOT NULL, qr_ciphertext bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), deleted_at timestamptz, UNIQUE(room_id,qr_hash));
CREATE TABLE score_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE, round_id uuid NOT NULL REFERENCES rounds ON DELETE RESTRICT, player_id uuid NOT NULL REFERENCES players ON DELETE RESTRICT, question integer NOT NULL CHECK(question BETWEEN 1 AND 10000), place integer NOT NULL CHECK(place BETWEEN 1 AND 1000), points integer NOT NULL CHECK(points BETWEEN -1000 AND 1000), event_type varchar(10) NOT NULL CHECK(event_type IN ('award','revoke')), reverses_event_id uuid REFERENCES score_events(id) ON DELETE RESTRICT, actor_session_id uuid, idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(room_id,idempotency_key));
CREATE UNIQUE INDEX single_reversal ON score_events(reverses_event_id) WHERE reverses_event_id IS NOT NULL;
CREATE TABLE host_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE, token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz, last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE audit_events(id bigserial PRIMARY KEY, room_id uuid REFERENCES rooms ON DELETE SET NULL, actor_session_id uuid, severity varchar(10) NOT NULL CHECK(severity IN ('info','warning','critical')), event_type varchar(60) NOT NULL, outcome varchar(20) NOT NULL, ip_hash bytea, correlation_id uuid NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX score_events_room_time ON score_events(room_id,created_at DESC);CREATE INDEX audit_room_time ON audit_events(room_id,created_at DESC);CREATE INDEX sessions_expiry ON host_sessions(expires_at);
REVOKE ALL ON SCHEMA public FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
COMMIT;
