-- Two language labels per quiz and an optional translation per question.
-- Sessions snapshot both, so editing a quiz never changes history.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS language_primary varchar(40) NOT NULL DEFAULT 'Nederlands';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS language_secondary varchar(40) NOT NULL DEFAULT 'English';
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS prompt_alt varchar(500)
 CHECK(prompt_alt IS NULL OR length(btrim(prompt_alt)) BETWEEN 1 AND 500);
ALTER TABLE games ADD COLUMN IF NOT EXISTS language_primary varchar(40);
ALTER TABLE games ADD COLUMN IF NOT EXISTS language_secondary varchar(40);
ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS prompt_alt varchar(500);
