-- Public question layout is chosen per question in the quiz editor and
-- snapshotted into sessions.
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS layout varchar(12) NOT NULL DEFAULT 'stacked'
 CHECK(layout IN ('stacked','split','overlay','text'));
ALTER TABLE game_questions ADD COLUMN IF NOT EXISTS layout varchar(12)
 CHECK(layout IN ('stacked','split','overlay','text'));
