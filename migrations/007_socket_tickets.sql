BEGIN;
CREATE TABLE socket_tickets(
 token_hash bytea PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES host_sessions(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX socket_tickets_expiry ON socket_tickets(expires_at);
GRANT SELECT,INSERT,DELETE ON socket_tickets TO scanscore_runtime;
COMMIT;
