ALTER TABLE rooms ADD COLUMN IF NOT EXISTS display_mode varchar(10) NOT NULL DEFAULT 'scores'
 CHECK(display_mode IN ('scores','question'));
