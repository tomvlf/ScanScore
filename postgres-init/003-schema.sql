CREATE EXTENSION IF NOT EXISTS pgcrypto;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM scanscore_runtime;
GRANT USAGE ON SCHEMA public TO scanscore_runtime;

CREATE TABLE rooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug varchar(40) NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
 title varchar(80) NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 80),
 display_mode varchar(10) NOT NULL DEFAULT 'scores' CHECK(display_mode IN ('scores','question')),
 display_language varchar(10) NOT NULL DEFAULT 'primary' CHECK(display_language IN ('primary','secondary','both')),
 login_name varchar(80) NOT NULL UNIQUE
  CHECK(length(login_name) BETWEEN 1 AND 80 AND login_name=lower(btrim(login_name))),
 host_secret_hash text NOT NULL,
 active_round_id uuid,
 question integer NOT NULL DEFAULT 1 CHECK(question BETWEEN 1 AND 10000),
 mode varchar(10) NOT NULL DEFAULT 'fixed' CHECK(mode IN ('fixed','places')),
 fixed_points integer NOT NULL DEFAULT 1 CHECK(fixed_points BETWEEN -1000 AND 1000),
 place_points integer[] NOT NULL DEFAULT ARRAY[5,3,1],
 once_per_question boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE rounds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 name varchar(60) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),
 ordinal integer NOT NULL CHECK(ordinal>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(room_id,ordinal)
);
ALTER TABLE rooms ADD CONSTRAINT rooms_active_round_fk
 FOREIGN KEY(active_round_id) REFERENCES rounds(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE players(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 name varchar(60) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),
 kind varchar(10) NOT NULL CHECK(kind IN ('person','team')),
 qr_hash bytea NOT NULL,
 qr_ciphertext bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 deleted_at timestamptz
);
CREATE UNIQUE INDEX players_active_qr ON players(room_id,qr_hash) WHERE deleted_at IS NULL;

CREATE TABLE score_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 round_id uuid NOT NULL REFERENCES rounds ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES players ON DELETE RESTRICT,
 question integer NOT NULL CHECK(question BETWEEN 1 AND 10000),
 place integer NOT NULL CHECK(place BETWEEN 1 AND 1000),
 points integer NOT NULL CHECK(points BETWEEN -1000 AND 1000),
 event_type varchar(10) NOT NULL CHECK(event_type IN ('award','revoke')),
 reverses_event_id uuid REFERENCES score_events(id) ON DELETE RESTRICT,
 actor_session_id uuid,
 idempotency_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(room_id,idempotency_key)
);
CREATE UNIQUE INDEX single_reversal ON score_events(reverses_event_id) WHERE reverses_event_id IS NOT NULL;

CREATE TABLE host_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 token_hash bytea NOT NULL UNIQUE,
 socket_role varchar(7) NOT NULL CHECK(socket_role IN ('host','display')),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sessions_expiry ON host_sessions(expires_at);

CREATE TABLE socket_tickets(
 token_hash bytea PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES host_sessions(id) ON DELETE CASCADE,
 socket_role varchar(7) NOT NULL CHECK(socket_role IN ('host','display')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX socket_tickets_expiry ON socket_tickets(expires_at);

CREATE TABLE login_attempts(
 key_hash bytea PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts>0),
 expires_at timestamptz NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(expires_at);

CREATE TABLE audit_events(
 id bigserial PRIMARY KEY,
 room_id uuid REFERENCES rooms ON DELETE SET NULL,
 actor_session_id uuid,
 severity varchar(10) NOT NULL CHECK(severity IN ('info','warning','critical')),
 event_type varchar(60) NOT NULL,
 outcome varchar(20) NOT NULL,
 ip_hash bytea,
 correlation_id uuid NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_room_time ON audit_events(room_id,created_at DESC);

CREATE TABLE quiz_images(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 mime varchar(30) NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
 data bytea NOT NULL,
 thumb_mime varchar(30) CHECK(thumb_mime IN ('image/jpeg','image/png','image/webp')),
 thumb_bytes integer CHECK(thumb_bytes BETWEEN 1 AND 524288),
 thumb_data bytea,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX quiz_images_room_time ON quiz_images(room_id,created_at DESC);

CREATE TABLE quizzes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 title varchar(120) NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 language_primary varchar(40) NOT NULL DEFAULT 'Nederlands',
 language_secondary varchar(40) NOT NULL DEFAULT 'English',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX quizzes_room_title ON quizzes(room_id,lower(btrim(title)));

CREATE TABLE quiz_questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 prompt varchar(500) NOT NULL CHECK(length(btrim(prompt)) BETWEEN 1 AND 500),
 prompt_alt varchar(500) CHECK(prompt_alt IS NULL OR length(btrim(prompt_alt)) BETWEEN 1 AND 500),
 points integer NOT NULL CHECK(points BETWEEN 1 AND 1000000),
 image_id uuid NOT NULL REFERENCES quiz_images(id) ON DELETE RESTRICT,
 UNIQUE(quiz_id,ordinal)
);

CREATE TABLE games(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 points_per_question integer CHECK(points_per_question BETWEEN 1 AND 1000000),
 current_question integer NOT NULL DEFAULT 1 CHECK(current_question BETWEEN 1 AND 10000),
 legacy boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_at timestamptz,
 quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL,
 quiz_title varchar(120),
 language_primary varchar(40),
 language_secondary varchar(40),
 question_count integer CHECK(question_count BETWEEN 1 AND 10000),
 CHECK((legacy AND ended_at IS NOT NULL) OR (NOT legacy AND points_per_question IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_game_per_room ON games(room_id) WHERE ended_at IS NULL;
CREATE INDEX games_room_time ON games(room_id,started_at DESC);
CREATE INDEX games_quiz ON games(quiz_id);

CREATE TABLE game_questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 game_id uuid NOT NULL REFERENCES games ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 points integer CHECK(points BETWEEN 1 AND 1000000),
 label varchar(100),
 prompt varchar(500),
 prompt_alt varchar(500),
 image_id uuid REFERENCES quiz_images(id) ON DELETE RESTRICT,
 UNIQUE(game_id,ordinal)
);
CREATE INDEX game_questions_image ON game_questions(image_id);

CREATE TABLE question_winners(
 question_id uuid NOT NULL REFERENCES game_questions ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players ON DELETE RESTRICT,
 legacy_points bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(question_id,player_id)
);

CREATE TABLE game_scans(
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 idempotency_key uuid NOT NULL,
 question_id uuid NOT NULL REFERENCES game_questions ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES players ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(room_id,idempotency_key)
);

CREATE INDEX score_events_room_time ON score_events(room_id,created_at DESC);
CREATE INDEX quiz_questions_image ON quiz_questions(image_id);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM scanscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON
 rooms,rounds,players,score_events,host_sessions,socket_tickets,login_attempts,
 audit_events,quiz_images,quizzes,quiz_questions,games,game_questions,
 question_winners,game_scans
 TO scanscore_runtime;
GRANT USAGE,SELECT ON SEQUENCE audit_events_id_seq TO scanscore_runtime;
