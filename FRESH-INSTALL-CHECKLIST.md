# Volledige frisse-installatiechecklist

## 1. Host voorbereiden
- [ ] Linuxhost is bijgewerkt en herstart indien een kernelupdate dat vereist.
- [ ] Docker Engine en Docker Compose v2 zijn geïnstalleerd.
- [ ] Alleen SSH en HTTPS zijn extern bereikbaar; PostgreSQL-poort 5432 is niet gepubliceerd.
- [ ] Systeemtijd/NTP werkt.
- [ ] Er is voldoende vrije schijfruimte en een apart back-updoel.

## 2. Bronbestanden controleren
- [ ] Production v7 plus deze v7.2-bestanden staan in één map.
- [ ] `migrations/001_init.sql` en `002_runtime_permissions.sql` zijn aanwezig.
- [ ] `postgres-init/001-security.sql` en `002-runtime-role.sh` zijn uitvoerbaar/leesbaar.
- [ ] `.env`, dumps en back-ups staan in `.gitignore`.
- [ ] Images en npm-dependencies zijn vastgezet en gescand in CI.

## 3. Secrets genereren
- [ ] Voer `./scripts/generate-secrets.sh` uit.
- [ ] Controleer dat `.env` modus 600 heeft.
- [ ] Bewaar owner- en runtimecredential afzonderlijk in de password manager.
- [ ] Bewaar de pepper en QR-encryptiesleutel buiten de server in een herstelkluis.
- [ ] Zet in `.env` exact `ALLOWED_ORIGINS=https://jouwdomein` zonder wildcard.

## 4. Preflight
- [ ] Voer `./scripts/preflight.sh` uit.
- [ ] `docker compose config --quiet` slaagt.
- [ ] De app ontvangt geen ownercredential.
- [ ] De migratieservice ontvangt geen runtimecredential.
- [ ] De database publiceert geen poort.
- [ ] Het backendnetwerk is intern.

## 5. Eerste start
- [ ] Start `docker compose up -d --build`.
- [ ] Controleer `docker compose ps`.
- [ ] De migratieservice eindigt succesvol met exitcode 0.
- [ ] Database en app worden healthy.
- [ ] `/readyz` retourneert succes via localhost/reverse proxy.
- [ ] Controleer logs op fouten zonder secrets in de output.

## 6. Runtimeprivileges testen
- [ ] Voer `./scripts/test-runtime-privileges.sh` uit.
- [ ] De test bevestigt de rol `scanscore_runtime`.
- [ ] DML-rechten op applicatietabellen werken.
- [ ] CREATE, ALTER, DROP, TRUNCATE, REFERENCES en TRIGGER worden geweigerd.
- [ ] `schema_migrations` is niet leesbaar.
- [ ] De rol is geen superuser en heeft geen CREATEDB, CREATEROLE, REPLICATION of BYPASSRLS.

## 7. Reverse proxy en TLS
- [ ] Alleen HTTPS/WSS wordt publiek aangeboden.
- [ ] HTTP wordt naar HTTPS omgeleid.
- [ ] WebSocket Upgrade/Connection headers worden doorgegeven.
- [ ] TLS-certificaat en automatische vernieuwing werken.
- [ ] Security headers zijn zichtbaar.
- [ ] Applicatiepoort 8088 luistert alleen op 127.0.0.1.

## 8. Functionele acceptatie
- [ ] Maak een tijdelijke quizruimte.
- [ ] Registreer twee testdeelnemers via QR-scan.
- [ ] Test vaste punten, plaatsverdeling, dubbele-scanblokkering en undo.
- [ ] Test het read-only scorescherm.
- [ ] Controleer dat het displaytoken geen mutaties kan uitvoeren.

## 9. Back-up en herstel
- [ ] Maak een eerste `pg_dump` in custom format.
- [ ] Versleutel en kopieer de back-up off-host.
- [ ] Herstel de dump in een afzonderlijke testdatabase.
- [ ] Documenteer RPO, RTO, retentie en verantwoordelijke persoon.
- [ ] Plan automatische back-ups en waarschuwingen bij mislukking.

## 10. Monitoring en onderhoud
- [ ] Centraliseer JSON-logs en beperk toegang.
- [ ] Maak alerts voor login failures, geweigerde acties, databasefouten en volle schijf.
- [ ] Plan dependency-, containerimage- en OS-updates.
- [ ] Draai periodiek SAST, DAST, dependency-audit en restore-test.
- [ ] Documenteer secretrotatie en incident response.
- [ ] Laat vóór publieke/commerciële inzet een onafhankelijke pentest uitvoeren.
