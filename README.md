# ScanScore

ScanScore is een selfhosted webapp voor fysieke quizzen en spellen. Winnaars tonen hun persoonlijke QR-code aan de quizmaster; de server valideert de scan en kent de score transactioneel toe.

## Kenmerken

- server-authoritative scoreverwerking;
- PostgreSQL met append-only score-events en undo-events;
- aparte databasegebruikers voor migraties en runtime;
- host- en read-only displayrollen;
- vaste punten of automatische plaatsverdeling;
- blokkering van dubbele scans per vraag;
- mobiele QR-scanner en live scorebord;
- Docker Compose-secrets, intern databasenetwerk en read-only containers;
- runtime-privilegetest, preflightcontrole en back-upscript.

## Vereisten

- Linuxserver;
- Docker Engine;
- Docker Compose v2;
- HTTPS-reverse-proxy met WebSocketondersteuning;
- `openssl` en Python 3 voor de installatiescripts.

## Frisse installatie

```bash
./scripts/generate-secrets.sh
```

Pas daarna `ALLOWED_ORIGINS` in `.env` aan naar het exacte publieke HTTPS-domein. Gebruik geen wildcard en geen trailing slash.

```bash
./scripts/preflight.sh
docker compose up -d --build
docker compose ps
./scripts/test-runtime-privileges.sh
```

De app luistert alleen op `127.0.0.1:8088`. Publiceer die poort via een HTTPS-reverse-proxy. PostgreSQL publiceert geen hostpoort.

## Gebruik

1. Open de website als quizmaster.
2. Maak een quizruimte met een sterk hostwachtwoord.
3. Bewaar het eenmalig getoonde displaytoken.
4. Registreer deelnemers door hun fysieke QR-kaart te scannen.
5. Kies vaste punten of een reeks zoals `5, 3, 1`.
6. Scan de winnaars en ga daarna naar de volgende vraag.
7. Open `/scoreboard.html` op een ander scherm met het read-only displaytoken.

## Back-up

```bash
./scripts/backup.sh
```

Bewaar dumps versleuteld buiten de host en test herstel periodiek met `pg_restore` in een afzonderlijke database.

## Ontwikkeling

```bash
npm ci
npm run check
npm test
```

## Beveiliging

Lees [SECURITY.md](SECURITY.md), [DOCKER-SECRETS-REVIEW.md](DOCKER-SECRETS-REVIEW.md) en [FRESH-INSTALL-CHECKLIST.md](FRESH-INSTALL-CHECKLIST.md). Meld kwetsbaarheden privé en plaats geen echte credentials in issues.

## Licentie

MIT
