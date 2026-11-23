-- Idempotent upgrades for existing databases. Fresh installs get these columns
-- from postgres-init/003-schema.sql.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS display_mode varchar(10) NOT NULL DEFAULT 'scores'
 CHECK(display_mode IN ('scores','question'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS display_language varchar(10) NOT NULL DEFAULT 'primary'
 CHECK(display_language IN ('primary','secondary','both'));
