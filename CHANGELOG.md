# Changelog

## Unreleased

- De image bevat nu `scripts/schema-upgrades/`, zodat een `schema-upgrade`-service die de app-image gebruikt bestaande databases kan bijwerken (o.a. kolom `layout`).
- Beveiligingshardening fase 1: strikte statische-bestandscontrole, `__Host-`-sessiecookie in productie, aparte limiet voor afbeeldinglezen, verlopen sessies krijgen geen WebSocket-updates meer, foutafhandeling voor streams en vaste server-time-outs.
- Beveiligingshardening fase 2: loginlimiet per client-en-ruimtecombinatie; veel mislukte pogingen van verschillende clients vertragen de ruimte (max. 8 s) in plaats van ze te blokkeren. Request bodies worden gelezen zonder databaseconnectie vast te houden, met maximaal zes gelijktijdige afbeeldinguploads; twee gelijktijdige scrypt-bewerkingen met queue-logging.
- Beveiligingshardening fase 3: database-rechten van de app-role versmald tot wat de server gebruikt; auditlog is append-only. Back-ups worden versleuteld met een aparte passphrase; bewaartermijn van 90 dagen voor auditgebeurtenissen (`scripts/retention.sh`) en een purge-script per ruimte (`scripts/purge-room.sh`).

- Quizbouwer met vragen, uploadbare afbeeldingen (met thumbnails) en punten per vraag.
- Quizsessies met snapshot van vraag en afbeelding; laatste vraag rondt de quiz af.
- Quizmaster kiest op het bedieningsscherm tussen klassement en **Vraag + beeld**, en kiest de taal van de vraag: eerste taal, tweede taal of beide; elk publiek scherm volgt automatisch.
- Quizzen hebben twee vrij te benoemen talen met een optionele vertaling per vraag.
- Publieke vraagweergave gebruikt het volledige scherm voor vraag en afbeelding; de ruimtenaam staat klein onder de deelnemers- en vraaginfo.
- Publieke vraagweergave met de actieve vraag en afbeelding, automatisch mee met de volgende vraag.
- UX-vernieuwing voor spelbediening, deelnemers, scores en het publieke scherm.
- Podium, relatieve scorebalken en gemarkeerde huidige vraag in het klassement.
- Snelle puntenkeuzes, wachtwoord tonen/verbergen en bevestigingsdialoog.
- Publiek scherm met live-indicator, volledigschermknop en kopieerbare link.
- Verbeterde mobiele indeling, donkere modus en grotere touchdoelen.

## 1.0.0 - 2026-11-15

- Eerste releaseklare repository.
- Server-authoritative scores met PostgreSQL-transacties.
- Gescheiden owner- en runtime-databasegebruikers.
- Docker Compose-secrets en runtime-privilegetest.
- Mobiele QR-workflow en vernieuwd live scorebord.
- GitHub Actions voor tests en GHCR-imagepublicatie.
