ALTER SYSTEM SET password_encryption='scram-sha-256';
ALTER SYSTEM SET log_connections='on';
ALTER SYSTEM SET log_disconnections='on';
ALTER SYSTEM SET log_lock_waits='on';
ALTER SYSTEM SET deadlock_timeout='1s';
ALTER SYSTEM SET idle_in_transaction_session_timeout='30s';
ALTER SYSTEM SET statement_timeout='15s';
SELECT pg_reload_conf();
