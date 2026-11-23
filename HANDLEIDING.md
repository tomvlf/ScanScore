# ScoreScan Production

## Installatie
1. Voer `./scripts/generate-secrets.sh` uit. De benodigde omgevingsvariabelen met geheimen komen in `.env` (permissies `0600`).
2. Vervang `ALLOWED_ORIGINS` in `.env` door het exacte HTTPS-domein.
3. Start met `docker compose up -d --build`.
4. Publiceer uitsluitend `127.0.0.1:8088` via een HTTPS-reverse-proxy met WebSocket-upgrade.
5. Open `/healthz` en controleer de container-healthchecks.

## PostgreSQL-migratie
De migraties gebruiken een PostgreSQL advisory lock en worden door de eenmalige `migrate`-service uitgevoerd. Spelstarts, spelers en QR-koppelingen blijven aan hun ruimte gekoppeld. `SELECT ... FOR UPDATE` serialiseert wijzigingen binnen één quizruimte. Een UUID-idempotency key voorkomt dat dezelfde scanrequest tweemaal wordt verwerkt.

## Quizzen en afbeeldingen
Een ruimte kan meerdere quizzes bevatten. Elke quiz bestaat uit vragen met een
tekst, een afbeelding (JPG, PNG of WebP, maximaal 5 MB) en een puntenwaarde.
Afbeeldingen worden als onveranderlijke assets in PostgreSQL bewaard en zitten
dus automatisch in de databaseback-up. De reverse proxy moet request bodies van
minimaal 6 MB doorlaten.

Bij het starten van een sessie worden de quizvraag, afbeelding en punten in het
spel gekopieerd. Later bewerken of verwijderen van de quiz verandert lopende of
afgesloten sessies niet. Een quiz blijft herbruikbaar voor nieuwe sessies. Het
publieke scorebord heeft de weergave **Vraag tonen** om de actieve vraag groot
te presenteren.

## Spellen en punten
Per ruimte kan één spel tegelijk actief zijn. Bij een quizsessie komen de punten
per vraag uit de quiz; bij een snel spel stelt de spelmeester één puntenpot in.
Nieuwe spellen beginnen met nul punten. De spelerslijst en persoonlijke
QR-koppelingen blijven aan de ruimte verbonden.

Winnaars worden per vraag bijgehouden. Hun aandeel is steeds de puntenpot van die vraag gedeeld door het aantal winnaars. Een nieuwe scan herverdeelt alle aandelen direct; breukdelen worden intern bewaard en op het scherm afgerond tot twee decimalen. De volgende vraag opent pas wanneer de spelmeester daarvoor kiest. Bij de laatste vraag rondt hij de quiz af. Een eerdere vraag kan tijdens het spel worden geopend, waarna winnaars kunnen worden verwijderd of opnieuw gescand.

Gestopte spellen worden bewaard voor het scorebord en zijn alleen-lezen. Historische score-events uit oudere versies worden bij de database-upgrade als onveranderbare historische spelresultaten bewaard.

## Back-up en herstel
Maak een back-up met `./scripts/backup.sh`. Test herstel periodiek in een afzonderlijke database met `pg_restore --clean --if-exists`. Bewaar back-ups versleuteld buiten de host en definieer een passend RPO/RTO.

## Aanmelden
De spelbediening en het scorescherm gebruiken dezelfde ruimtenaam en hetzelfde
wachtwoord. Een intrekbare `Secure`, `HttpOnly`-cookie bewaart de aanmelding
maximaal 24 uur. Na de login gebruikt de WebSocket alleen een rolgebonden,
eenmalige ticket met een geldigheid van 30 seconden; wachtwoorden gaan nooit
via de WebSocket. In productie is de cookie uitsluitend via HTTPS beschikbaar.
**Afmelden** trekt de browsersessie en open tickets in. Het wachtwoord wordt
niet in browseropslag bewaard. Het scorescherm blijft alleen-lezen, maar wie
het gedeelde wachtwoord kent kan ook de spelbediening openen.

Wijzig een vermoed gelekt wachtwoord via **Meer > Wachtwoord wijzigen**. Alle
host- en displaysessies worden daarbij ingetrokken. Via **Alle sessies
afmelden** kan alleen de host alle apparaten ontkoppelen zonder het wachtwoord
te wijzigen.

## Extra hardening
- Database zit uitsluitend op een intern Docker-netwerk en publiceert geen poort.
- PostgreSQL gebruikt SCRAM-SHA-256 en time-outs.
- Hostwachtwoorden gebruiken scrypt + unieke salt + server-pepper.
- Nieuwe ruimtes vereisen minstens 16 tekens; loginpogingen worden persistent begrensd per client en ruimte.
- Sessies bevatten een niet-opwaardeerbare `host`- of `display`-rol; muterende HTTP-routes vereisen `host`.
- WebSocket-tickets zijn rolgebonden, gehasht opgeslagen, eenmalig bruikbaar en 30 seconden geldig.
- Per ruimte blijven maximaal 12 actieve sessies; oudere sessies worden ingetrokken.
- CI controleert productiedependencies met `npm audit --audit-level=high`.
- QR-waarden worden gezocht via HMAC en versleuteld met AES-256-GCM opgeslagen.
- SQL is geparameteriseerd; databaseconstraints beschermen integriteit.
- Auditlog gebruikt UTC, correlation IDs en gehashte IP-adressen.
- Strikte Origin-allowlist, CSP, WSS, payload-, login- en berichtlimieten.
- Begrensde, ge-serialiseerde scryptbewerkingen en aparte quotas voor het aanmaken van ruimten.
- Alleen het vast aantal vertrouwde proxyhops bepaalt het clientadres voor rate limiting en auditlogs.
- Containers draaien read-only, zonder extra privileges en met resourcegrenzen.

## Productiechecklist
- Gebruik een actuele, ondersteunde PostgreSQL minor release.
- Configureer TLS op de reverse proxy en eventueel mTLS/TLS tussen app en externe database.
- Centraliseer JSON-logs en maak alerts voor login failures, denied actions en database errors.
- Draai `npm audit --omit=dev`, image scanning, SBOM, SAST en DAST in CI.
- Test restores, rotatie en incident response.
- Laat vóór publieke inzet een onafhankelijke pentest uitvoeren.
