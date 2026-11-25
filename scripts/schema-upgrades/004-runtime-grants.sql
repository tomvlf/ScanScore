-- Least-privilege runtime grants, matching postgres-init/003-schema.sql.
-- audit_events is append-only for the app role; retention purges and room
-- deletion run as owner (scripts/retention.sh, scripts/purge-room.sh).
-- rounds and score_events are legacy tables the current server never reads.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM scanscore_runtime;
GRANT SELECT,INSERT,UPDATE ON rooms TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE ON players TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON host_sessions TO scanscore_runtime;
GRANT SELECT,INSERT,DELETE ON socket_tickets TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON login_attempts TO scanscore_runtime;
GRANT INSERT ON audit_events TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON quiz_images TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON quizzes TO scanscore_runtime;
GRANT SELECT,INSERT,DELETE ON quiz_questions TO scanscore_runtime;
GRANT SELECT,INSERT,UPDATE ON games TO scanscore_runtime;
GRANT SELECT,INSERT ON game_questions TO scanscore_runtime;
GRANT SELECT,INSERT,DELETE ON question_winners TO scanscore_runtime;
GRANT SELECT,INSERT ON game_scans TO scanscore_runtime;
GRANT USAGE,SELECT ON SEQUENCE audit_events_id_seq TO scanscore_runtime;
