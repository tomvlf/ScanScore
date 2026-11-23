BEGIN;

-- Uploaded images are immutable assets. Quizzes and sessions reference them,
-- so editing a quiz or replaying it never rewrites historical images.
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
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX quizzes_room_title ON quizzes(room_id,lower(btrim(title)));

CREATE TABLE quiz_questions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 prompt varchar(500) NOT NULL CHECK(length(btrim(prompt)) BETWEEN 1 AND 500),
 points integer NOT NULL CHECK(points BETWEEN 1 AND 1000000),
 image_id uuid NOT NULL REFERENCES quiz_images(id) ON DELETE RESTRICT,
 UNIQUE(quiz_id,ordinal)
);

-- Sessions snapshot the quiz content. Editing or deleting a quiz later does
-- not change a running or historical session.
ALTER TABLE games ADD COLUMN quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN quiz_title varchar(120);
ALTER TABLE games ADD COLUMN question_count integer CHECK(question_count BETWEEN 1 AND 10000);
ALTER TABLE game_questions ADD COLUMN prompt varchar(500);
ALTER TABLE game_questions ADD COLUMN image_id uuid REFERENCES quiz_images(id) ON DELETE RESTRICT;

CREATE INDEX games_quiz ON games(quiz_id);
CREATE INDEX game_questions_image ON game_questions(image_id);
CREATE INDEX quiz_questions_image ON quiz_questions(image_id);

GRANT SELECT,INSERT,UPDATE,DELETE ON quiz_images,quizzes,quiz_questions TO scanscore_runtime;

COMMIT;
