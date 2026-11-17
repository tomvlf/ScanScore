# ScoreScan

**Scan fysieke QR-kaarten, ken automatisch punten toe en toon het klassement live op een tweede scherm.**

ScoreScan is een selfhosted webapp voor quizzen, spellen en activiteiten waarbij deelnemers een persoonlijke QR-code gebruiken. De spelmeester scant de winnaars van iedere vraag; de server verdeelt de puntenpot gelijk en werkt het publieke scorebord onmiddellijk bij.

## Wat kun je ermee?

- deelnemers of ploegen aan een fysieke QR-kaart koppelen;
- winnaars scannen met de camera van een smartphone;
- één spel tegelijk in een ruimte spelen;
- deelnemers en hun QR-koppelingen tussen spellen behouden;
- de puntenpot per vraag gelijk verdelen over alle gescande winnaars;
- eerdere vragen tijdens het spel corrigeren;
- totalen of punten per vraag bekijken;
- gestopte spellen als historiek bewaren;
- het klassement live tonen op een laptop, tv of beamer;
- alles op je eigen server hosten.

## Hoe werkt een spel?

1. De spelmeester maakt een beveiligde ruimte en is meteen aangemeld.
2. Deelnemers worden met hun naam en persoonlijke QR-code aan de ruimte gekoppeld.
3. Voor het spel wordt de puntenpot per vraag ingesteld.
4. Iedere winnaar wordt gescand; de pot wordt live gelijk onder de winnaars verdeeld.
5. De spelmeester kiest **Volgende vraag** zodra alle winnaars van die vraag gescand zijn.
6. Eerdere vragen zijn tijdens het spel opnieuw te openen om winnaars te corrigeren.

## Opbouw

ScoreScan bestaat uit vier services:

- **app**: de webinterface en server-authoritative spellogica;
- **db**: PostgreSQL voor spelruimtes, deelnemers, score-events en auditgegevens;
- **migrate**: voert databasewijzigingen uit met een afzonderlijke owner-gebruiker;
- **privilege-test**: controleert dat de runtimegebruiker geen schemawijzigingen kan uitvoeren.

De applicatie gebruikt een afzonderlijke, beperkt bevoegde databasegebruiker. PostgreSQL is alleen bereikbaar via het interne Docker-netwerk.

## Vereisten

Voor een productie-installatie heb je nodig:

- een Linuxserver met Docker Engine;
- Docker Compose v2.24.4 of nieuwer;
- `openssl`;
- Python 3;
- een domeinnaam;
- een HTTPS-reverse-proxy met WebSocketondersteuning.

De app wordt lokaal aangeboden op `127.0.0.1:8088`. PostgreSQL publiceert geen poort naar de Docker-host.

---

# Snelle installatie

## 1. Repository ophalen

```bash
git clone https://github.com/tomvlf/ScanScore.git
cd ScanScore
```

## 2. Secrets genereren

```bash
./scripts/generate-secrets.sh
```

Dit maakt lokaal aan:

- `.env` met alle benodigde omgevingsvariabelen;
- een database-ownerwachtwoord en een afzonderlijk runtimewachtwoord;
- databaseverbindingen voor beide rollen;
- een server-pepper en QR-encryptiesleutel.

Het bestand `.env` bevat geheimen, wordt door Git genegeerd en krijgt permissies `0600`. **Commit dit bestand nooit.**

## 3. Publiek domein instellen

Open `.env` en vervang de voorbeeldwaarde:

```text
ALLOWED_ORIGINS=https://quiz.example.be
```

Gebruik je exacte publieke adres, bijvoorbeeld:

```text
ALLOWED_ORIGINS=https://quiz.jouwdomein.be
```

Gebruik:

- `https://`;
- geen wildcard;
- geen pad achter het domein;
- geen slash op het einde.

## 4. Configuratie vooraf controleren

```bash
./scripts/preflight.sh
```

De preflight controleert onder meer:

- Docker en Docker Compose;
- de aanwezigheid en lengte van alle secrets;
- de HTTPS-origin;
- de geldigheid van `compose.yml`;
- dat de app geen database-ownercredential ontvangt;
- dat PostgreSQL geen poort publiceert;
- dat het backendnetwerk intern is.

Los eventuele foutmelding eerst op voordat je verdergaat.

## 5. Stack starten

Gebruik de automatisch gebouwde Docker-image zonder lokaal te bouwen:

```bash
export COMPOSE_FILE=compose.yml:compose.ghcr.example.yml
./scripts/preflight.sh
docker compose pull
docker compose up -d --no-build
```

De image `ghcr.io/tomvlf/scanscore:latest` wordt na iedere push naar `main`
gepubliceerd voor `linux/amd64` en `linux/arm64`, net als bij Athlima.
De eerste build moet voltooid zijn voordat je de image kunt ophalen.
Er zijn ook vaste tags `sha-<volledige-commit-SHA>` en versietags zoals `1.0.0`.
Stel desgewenst `SCANSCORE_IMAGE_TAG` in `.env` in om een specifieke build te gebruiken.
Een release-tag vervangt `latest` niet.

Maak het containerpakket na de eerste publicatie publiek via de pakketinstellingen
op GitHub als installeren zonder login gewenst is. Voor een privaat pakket moet
je eerst bij `ghcr.io` inloggen met een token met `read:packages`-toegang.

Wil je in plaats daarvan lokaal bouwen, laat `COMPOSE_FILE` dan weg:

```bash
docker compose up -d --build
```

Voer bij een nieuwe shell opnieuw `export COMPOSE_FILE=compose.yml:compose.ghcr.example.yml`
uit als je de gepubliceerde images gebruikt. Zo gebruiken ook de migratie- en testservices
dezelfde image zonder lokale build.

Bekijk daarna de toestand:

```bash
docker compose ps
```

Verwacht resultaat:

- `db` wordt **healthy**;
- `migrate` eindigt succesvol met exitcode `0`;
- `app` wordt **healthy**.

Logs bekijken:

```bash
docker compose logs -f app db migrate
```

## 6. Databasebeperkingen testen

```bash
./scripts/test-runtime-privileges.sh
```

Deze integratietest bevestigt dat de applicatie normale spelgegevens kan lezen en schrijven, maar geen tabellen kan aanmaken, wijzigen, verwijderen of leegmaken.

## 7. Reverse proxy instellen

Laat je reverse proxy HTTPS en WebSocketverbindingen doorsturen naar:

```text
http://127.0.0.1:8088
```

Publiceer poort `8088` niet rechtstreeks op internet. Gebruik de toepassing in productie uitsluitend via HTTPS/WSS, anders is de camerafunctie op veel mobiele browsers niet beschikbaar.

## 8. Eerste functionele test

Open je publieke ScoreScan-adres en doorloop deze controle:

1. Maak een tijdelijke spelruimte.
2. Bewaar het eenmalig getoonde displaytoken.
3. Meld je aan als spelmeester.
4. Registreer drie testdeelnemers en start een spel met een puntenpot van 50.
5. Scan twee winnaars en controleer dat zij elk 25 punten krijgen.
6. Scan een derde winnaar en controleer dat de punten herverdelen naar circa 16,67 per speler.
7. Open vraag 1 opnieuw, verwijder een winnaar en controleer de herverdeling.
8. Open het publieke scorebord en wissel tussen totalen en punten per vraag.
9. Stop het spel en start een nieuw spel; de spelers blijven, de nieuwe scores beginnen op nul.

---

# ScoreScan gebruiken

## Een spelruimte maken

Vul in het startscherm in:

- een unieke ruimtenaam van maximaal 80 tekens, bijvoorbeeld `Familiequiz`;
- een hostwachtwoord van minstens 12 tekens of 8–16 cijfers.

Klik op **Ruimte maken**. Je wordt automatisch aangemeld met de gekozen
ruimtenaam en het wachtwoord. Om later terug te keren vul je dezelfde naam en
hetzelfde wachtwoord in en klik je op **Aanmelden**. Hoofdletters in de
ruimtenaam maken geen verschil; spaties aan het begin en einde worden genegeerd.

Bestaat de ruimtenaam al? Kies een andere naam voor een nieuwe ruimte, of meld
je aan met het oorspronkelijke wachtwoord. Bestaande ruimtes behouden hun
wachtwoord en spelgegevens. Hun quiznaam wordt de aanmeldnaam; bij dubbele
quiznamen of een conflict met een bestaand ruimte-ID blijft het oude ruimte-ID
de aanmeldnaam.

Het gegenereerde **displaytoken** vind je direct na het maken onder
**Meer → Publiek scorebord**. Bewaar dit veilig. Het geeft alleen leestoegang
tot het publieke scorebord en kan niet worden gebruikt om als quizmaster aan
te melden. Een gegenereerd ruimte-ID is evenmin een hostaanmeldnaam.

## Deelnemers registreren en beheren

1. Open **Deelnemers**.
2. Vul de naam in en kies **Persoon** of **Ploeg**.
3. Kies **Camera openen en QR koppelen** en scan de persoonlijke QR-code.

Bij het wisselen van scherm stopt de actieve scanner, zodat de puntenscanner
en de spelersscanner de camera niet tegelijk vasthouden. Start de gewenste
scanner opnieuw op het nieuwe scherm. Cameraproblemen blijven bij de
spelersscanner zichtbaar; controleer bij een blokkering de cameratoestemming
in de site-instellingen van je browser en gebruik het HTTPS-adres van de app.
Een deelnemer kan vóór, tijdens of na een spel worden toegevoegd. Verwijderen
haalt de deelnemer uit de ruimte; reeds behaalde scores blijven in de
spelhistoriek staan. Een vrijgekomen QR-code kan opnieuw worden gekoppeld.

## Spelen en punten verdelen

1. Open **Spelen** en start een spel met het aantal punten per vraag.
2. Scan iedere winnaar van de huidige vraag. Iedere geldige scan krijgt
   aanvankelijk de volledige pot; de app herberekent de gelijke aandelen
   onmiddellijk zodra er meer winnaars bijkomen.
3. Voorbeeld: bij 50 punten krijgen twee winnaars 25 punten elk. Bij drie
   winnaars is dat 16,67 per winnaar. Breukdelen blijven intern behouden; de
   weergave rondt af op twee decimalen.
4. Kies **Volgende vraag** wanneer alle winnaars gescand zijn.
5. Kies een eerdere vraag in de vraagkiezer om een winnaar te verwijderen of
   opnieuw te scannen. De verdeling en totaalscores worden direct bijgewerkt.
6. Stop het spel wanneer het afgelopen is. Een nieuw spel begint met nul
   punten; spelers, QR-koppelingen en eerdere spelresultaten blijven bewaard.

## Publiek scorebord openen

Open op het andere apparaat:

```text
https://quiz.jouwdomein.be/scoreboard.html
```

Vul de ruimte-ID en het displaytoken in. Het scorebord kan geen deelnemers of
scores wijzigen. Kies **Totaalpunten** of **Punten per vraag** en selecteer
desgewenst een eerder spel.

---

# Beheer

## Stoppen en opnieuw starten

```bash
docker compose stop
docker compose start
```

## Bijwerken vanuit Git

Maak eerst een back-up. Haal daarna de nieuwe configuratie en gepubliceerde image op:

```bash
git pull --ff-only
export COMPOSE_FILE=compose.yml:compose.ghcr.example.yml
./scripts/preflight.sh
docker compose pull
docker compose up -d --no-build
```

Gebruik je een vaste `SCANSCORE_IMAGE_TAG`, werk die dan eerst bij in `.env`.
Voor een lokale build gebruik je in plaats daarvan:

```bash
git pull --ff-only
docker compose up -d --build
```

Controleer vervolgens:

```bash
docker compose ps
./scripts/test-runtime-privileges.sh
```

## Back-up maken

```bash
./scripts/backup.sh
```

Het script maakt een PostgreSQL-dump en een SHA-256-controlebestand in `backups/`.

Voor productiegebruik:

- kopieer back-ups versleuteld naar een andere machine of opslagdienst;
- controleer of geplande back-ups werkelijk slagen;
- test periodiek een herstel in een afzonderlijke database;
- bewaar de server-pepper en QR-encryptiesleutel eveneens buiten de server.

## Status en logs

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 db
```

De readinesscontrole is beschikbaar via de appcontainer op `/readyz`.

---

# Problemen oplossen

## De camera opent niet

Controleer dat:

- de website via HTTPS wordt geopend;
- de browser cameratoegang heeft gekregen;
- geen andere app de camera gebruikt;
- je de pagina opnieuw hebt geladen na het geven van toestemming.

## De app blijft offline

Controleer:

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 db
```

Controleer ook of de reverse proxy WebSocket-upgrades doorstuurt en of `ALLOWED_ORIGINS` exact overeenkomt met het publieke adres.

## `preflight.sh` weigert de origin

Gebruik één exact HTTPS-adres zonder wildcard of slash op het einde:

```text
ALLOWED_ORIGINS=https://quiz.jouwdomein.be
```

## De migratieservice stopt

Bekijk de migratielogs:

```bash
docker compose logs migrate
```

Start de app niet met handmatig verruimde databaserechten. Los eerst de migratiefout op.

## De privilegetest mislukt

Voer uit:

```bash
docker compose logs db migrate
docker compose --profile test run --rm privilege-test
```

Een mislukte test betekent dat de database niet met de verwachte runtimebeperkingen draait. Gebruik de installatie dan nog niet publiek.

---

# Ontwikkeling

Dependencies installeren en controles uitvoeren:

```bash
npm ci
npm run check
npm run test:unit

# Met een draaiende Docker-stack:
npm run test:e2e
npm run test:privileges
```

Volledige repositorycontrole:

```bash
npm run repo:check
```

Belangrijke mappen:

```text
public/          browserinterface
migrations/      PostgreSQL-schemawijzigingen
postgres-init/   eenmalige veilige database-initialisatie
scripts/         installatie-, test- en beheerhulpmiddelen
test/            statische en integratietests
.github/         CI, containerrelease en Dependabot
```

Elke push naar `main` publiceert `ghcr.io/tomvlf/scanscore:latest` en een
`sha-<volledige-commit-SHA>`-tag via GitHub Actions. Een release-tag zoals `v1.0.0`
publiceert daarnaast de versietags `1.0.0` en `1.0` in GitHub Container Registry.

---

# Beveiliging en documentatie

- [Automatische featuretests](FEATURE-TEST-COVERAGE.md)
- [Securitybeleid](SECURITY.md)
- [Docker-secretscontrole](DOCKER-SECRETS-REVIEW.md)
- [Volledige frisse-installatiechecklist](FRESH-INSTALL-CHECKLIST.md)
- [Repository-inventaris](REPOSITORY-INVENTORY.md)
- [UX-ontwerpnotities](UX-DESIGN-NOTES.md)
- [Bijdragen](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

Meld beveiligingsproblemen privé. Plaats nooit wachtwoorden, displaytokens, QR-codes, databasedumps of persoonsgegevens in een openbaar issue.

## Licentie

ScoreScan wordt gepubliceerd onder de [MIT-licentie](LICENSE).
