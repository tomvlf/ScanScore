BEGIN;

TRUNCATE host_sessions CASCADE;
ALTER TABLE host_sessions ADD COLUMN socket_role varchar(7) NOT NULL
 CHECK(socket_role IN ('host','display'));

TRUNCATE socket_tickets;
ALTER TABLE socket_tickets ADD COLUMN socket_role varchar(7);
UPDATE socket_tickets SET socket_role='host' WHERE socket_role IS NULL;
ALTER TABLE socket_tickets ALTER COLUMN socket_role SET NOT NULL;
ALTER TABLE socket_tickets ADD CONSTRAINT socket_tickets_role_check
 CHECK(socket_role IN ('host','display'));

CREATE TABLE login_attempts(
 key_hash bytea PRIMARY KEY,
 attempts integer NOT NULL CHECK(attempts>0),
 expires_at timestamptz NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON login_attempts TO scanscore_runtime;

DROP TABLE display_tokens;

COMMIT;
