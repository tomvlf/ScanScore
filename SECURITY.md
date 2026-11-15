# Security Policy

## Supported version

Alleen de meest recente release wordt ondersteund met beveiligingsupdates.

## Kwetsbaarheid melden

Meld een kwetsbaarheid privé via GitHub Private Vulnerability Reporting als dit voor de repository is ingeschakeld. Maak geen openbaar issue met exploits, credentials, QR-codes of persoonsgegevens.

Vermeld waar mogelijk de versie, impact, reproduceerbare stappen en een veilige proof of concept. Verwacht geen garantie op een reactietermijn voor een persoonlijk open-sourceproject.

## Operationele beveiliging

- Gebruik uitsluitend HTTPS/WSS.
- Publiceer PostgreSQL en poort 8088 niet rechtstreeks op internet.
- Bewaar `secrets/`, `.env` en back-ups buiten Git.
- Roteer credentials na een vermoedelijke blootstelling.
- Voer dependency-, image- en restorechecks periodiek uit.
