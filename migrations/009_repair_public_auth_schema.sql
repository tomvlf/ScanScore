BEGIN;

TRUNCATE host_sessions CASCADE;

ALTER TABLE host_sessions ADD COLUMN IF NOT EXISTS socket_role varchar(7);
UPDATE host_sessions SET socket_role=COALESCE(socket_role,'host');
ALTER TABLE host_sessions ALTER COLUMN socket_role SET NOT NULL;
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='host_sessions'::regclass AND conname='host_sessions_role_check'
 ) THEN
  ALTER TABLE host_sessions ADD CONSTRAINT host_sessions_role_check
   CHECK(socket_role IN ('host','display'));
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS socket_tickets(
 token_hash bytea PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES host_sessions(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE socket_tickets ADD COLUMN IF NOT EXISTS socket_role varchar(7);
UPDATE socket_tickets SET socket_role=COALESCE(socket_role,'host');
ALTER TABLE socket_tickets ALTER COLUMN socket_role SET NOT NULL;
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='socket_tickets'::regclass AND conname='socket_tickets_role_check'
 ) THEN
  ALTER TABLE socket_tickets ADD CONSTRAINT socket_tickets_role_check
   CHECK(socket_role IN ('host','display'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS socket_tickets_expiry ON socket_tickets(expires_at);
GRANT SELECT,INSERT,DELETE ON socket_tickets TO scanscore_runtime;

CREATE TABLE IF NOT EXISTS login_attempts(
 key_hash bytea PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts>0),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON login_attempts TO scanscore_runtime;

DROP TABLE IF EXISTS display_tokens;

COMMIT;
