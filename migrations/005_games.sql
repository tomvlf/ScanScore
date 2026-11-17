BEGIN;
CREATE TABLE games(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL REFERENCES rooms ON DELETE CASCADE,
 points_per_question integer CHECK(points_per_question BETWEEN 1 AND 1000000),
 current_question integer NOT NULL DEFAULT 1 CHECK(current_question BETWEEN 1 AND 10000),
 legacy boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_at timestamptz,
 CHECK((legacy AND ended_at IS NOT NULL) OR (NOT legacy AND points_per_question IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_game_per_room ON games(room_id) WHERE ended_at IS NULL;
CREATE INDEX games_room_time ON games(room_id,started_at DESC);
CREATE TABLE game_questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 game_id uuid NOT NULL REFERENCES games ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 points integer CHECK(points BETWEEN 1 AND 1000000),
 label varchar(100),
 UNIQUE(game_id,ordinal)
);
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

-- Keep old, possibly unequal awards as read-only history, without redistributing them.
INSERT INTO games(room_id,legacy,started_at,ended_at)
 SELECT room_id,true,min(created_at),max(created_at) FROM score_events GROUP BY room_id;
WITH old_questions AS (
 SELECT e.room_id,e.round_id,e.question,r.name,
 row_number() OVER(PARTITION BY e.room_id ORDER BY r.ordinal,e.question) AS ordinal
 FROM score_events e JOIN rounds r ON r.id=e.round_id
 GROUP BY e.room_id,e.round_id,e.question,r.name,r.ordinal
)
INSERT INTO game_questions(game_id,ordinal,label)
 SELECT g.id,q.ordinal,q.name||' - Vraag '||q.question
 FROM old_questions q JOIN games g ON g.room_id=q.room_id AND g.legacy;
WITH old_questions AS (
 SELECT e.room_id,e.round_id,e.question,
 row_number() OVER(PARTITION BY e.room_id ORDER BY r.ordinal,e.question) AS ordinal
 FROM score_events e JOIN rounds r ON r.id=e.round_id
 GROUP BY e.room_id,e.round_id,e.question,r.ordinal
)
INSERT INTO question_winners(question_id,player_id,legacy_points)
 SELECT q.id,e.player_id,sum(CASE WHEN e.event_type='award' THEN e.points ELSE -e.points END)
 FROM score_events e
 JOIN old_questions old ON old.room_id=e.room_id AND old.round_id=e.round_id AND old.question=e.question
 JOIN games g ON g.room_id=e.room_id AND g.legacy
 JOIN game_questions q ON q.game_id=g.id AND q.ordinal=old.ordinal
 GROUP BY q.id,e.player_id;
UPDATE games g SET current_question=(SELECT max(ordinal) FROM game_questions q WHERE q.game_id=g.id)
 WHERE g.legacy;

ALTER TABLE players DROP CONSTRAINT players_room_id_qr_hash_key;
CREATE UNIQUE INDEX players_active_qr ON players(room_id,qr_hash) WHERE deleted_at IS NULL;
GRANT SELECT,INSERT,UPDATE,DELETE ON games,game_questions,question_winners,game_scans TO scanscore_runtime;
COMMIT;
