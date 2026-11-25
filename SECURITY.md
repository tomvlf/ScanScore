# Security Policy

## Supported version

Alleen de meest recente release wordt ondersteund met beveiligingsupdates.

## Kwetsbaarheid melden

Meld een kwetsbaarheid privé via GitHub Private Vulnerability Reporting als dit voor de repository is ingeschakeld. Maak geen openbaar issue met exploits, credentials, QR-codes of persoonsgegevens.

Vermeld waar mogelijk de versie, impact, reproduceerbare stappen en een veilige proof of concept. Verwacht geen garantie op een reactietermijn voor een persoonlijk open-sourceproject.

## Operationele beveiliging

- Gebruik uitsluitend HTTPS/WSS.
- Publiceer PostgreSQL en poort 8088 niet rechtstreeks op internet.
- Bewaar `.env` en back-ups buiten Git en beperk `.env` tot permissies `0600`.
- Back-ups worden versleuteld (AES-256, PBKDF2) met een aparte `BACKUP_PASSPHRASE`; bewaar die buiten de host.
- De app-databaserol kan auditgebeurtenissen alleen toevoegen (append-only). Opschoning na 90 dagen en ruimteverwijdering draaien als owner via `scripts/retention.sh` en `scripts/purge-room.sh`.
- Quizafbeeldingen worden alleen aan de eigen ruimte geserveerd en zijn beperkt tot JPG, PNG en WebP van maximaal 5 MB. SVG en actieve bestandsformaten worden geweigerd.
- Roteer credentials na een vermoedelijke blootstelling.
- Voer dependency- en imagechecks wekelijks en een restore-test maandelijks uit.
