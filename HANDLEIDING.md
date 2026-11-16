# ScanScore Production v7

## Installatie
1. Voer `./scripts/generate-secrets.sh` uit. De benodigde omgevingsvariabelen met geheimen komen in `.env` (permissies `0600`).
2. Vervang `ALLOWED_ORIGINS` in `.env` door het exacte HTTPS-domein.
3. Start met `docker compose up -d --build`.
4. Publiceer uitsluitend `127.0.0.1:8088` via een HTTPS-reverse-proxy met WebSocket-upgrade.
5. Open `/healthz` en controleer de container-healthchecks.

## PostgreSQL-migratie
De migraties gebruiken een PostgreSQL advisory lock en worden door de eenmalige `migrate`-service uitgevoerd. Scoretoekenningen zijn append-only events. Undo voegt een `revoke`-event toe. `SELECT ... FOR UPDATE` serialiseert wijzigingen binnen één quizruimte. Een UUID-idempotency key voorkomt dat dezelfde scanrequest tweemaal wordt verwerkt.

## Back-up en herstel
Maak een back-up met `./scripts/backup.sh`. Test herstel periodiek in een afzonderlijke database met `pg_restore --clean --if-exists`. Bewaar back-ups versleuteld buiten de host en definieer een passend RPO/RTO.

## Extra hardening
- Database zit uitsluitend op een intern Docker-netwerk en publiceert geen poort.
- PostgreSQL gebruikt SCRAM-SHA-256 en time-outs.
- Hostwachtwoorden gebruiken scrypt + unieke salt + server-pepper.
- QR-waarden worden gezocht via HMAC en versleuteld met AES-256-GCM opgeslagen.
- Displaytokens zijn read-only, gehasht en intrekbaar.
- SQL is geparameteriseerd; databaseconstraints beschermen integriteit.
- Auditlog gebruikt UTC, correlation IDs en gehashte IP-adressen.
- Strikte Origin-allowlist, CSP, WSS, payload-, login- en berichtlimieten.
- Containers draaien read-only, zonder extra privileges en met resourcegrenzen.

## Productiechecklist
- Gebruik een actuele, ondersteunde PostgreSQL minor release.
- Configureer TLS op de reverse proxy en eventueel mTLS/TLS tussen app en externe database.
- Centraliseer JSON-logs en maak alerts voor login failures, denied actions en database errors.
- Draai `npm audit --omit=dev`, image scanning, SBOM, SAST en DAST in CI.
- Test restores, rotatie en incident response.
- Laat vóór publieke inzet een onafhankelijke pentest uitvoeren.
