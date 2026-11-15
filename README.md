# ScanScore

**Scan fysieke QR-kaarten, ken automatisch punten toe en toon het klassement live op een tweede scherm.**

ScanScore is een selfhosted webapp voor quizzen, spellen en activiteiten waarbij deelnemers een persoonlijke QR-code gebruiken. De quizmaster scant de winnaar; de server controleert de actie, kent de juiste punten toe en werkt het publieke scorebord onmiddellijk bij.

## Wat kun je ermee?

- deelnemers of ploegen aan een fysieke QR-kaart koppelen;
- winnaars scannen met de camera van een smartphone;
- iedereen hetzelfde aantal punten geven;
- punten volgens scanvolgorde uitdelen, bijvoorbeeld **5, 3 en 1**;
- voorkomen dat iemand tweemaal scoort voor dezelfde vraag;
- de laatste scoretoekenning ongedaan maken;
- meerdere rondes en vragen beheren;
- het klassement live tonen op een laptop, tv of beamer;
- alles op je eigen server hosten.

## Hoe werkt een spel?

1. De quizmaster maakt een beveiligde spelruimte.
2. Iedere deelnemer wordt eenmaal aan een QR-kaart gekoppeld.
3. De quizmaster kiest de ronde, vraag en puntverdeling.
4. Winnaars tonen hun QR-kaart en worden in volgorde gescand.
5. ScanScore verwerkt de punten en synchroniseert het scorebord.
6. Na de vraag kiest de quizmaster **Volgende vraag**.

## Opbouw

ScanScore bestaat uit vier services:

- **app**: de webinterface en server-authoritative spellogica;
- **db**: PostgreSQL voor spelruimtes, deelnemers, score-events en auditgegevens;
- **migrate**: voert databasewijzigingen uit met een afzonderlijke owner-gebruiker;
- **privilege-test**: controleert dat de runtimegebruiker geen schemawijzigingen kan uitvoeren.

De applicatie gebruikt een afzonderlijke, beperkt bevoegde databasegebruiker. PostgreSQL is alleen bereikbaar via het interne Docker-netwerk.

## Vereisten

Voor een productie-installatie heb je nodig:

- een Linuxserver met Docker Engine;
- Docker Compose v2;
- `openssl`;
- Python 3;
- een domeinnaam;
- een HTTPS-reverse-proxy met WebSocketondersteuning.

De app wordt lokaal aangeboden op `127.0.0.1:8088`. PostgreSQL publiceert geen poort naar de Docker-host.

---

# Snelle installatie

## 1. Repository ophalen

```bash
git clone https://github.com/JOUW-GEBRUIKER/scanscore.git
cd scanscore
```

Vervang `JOUW-GEBRUIKER` door je GitHub-gebruikersnaam of organisatie.

## 2. Secrets genereren

```bash
./scripts/generate-secrets.sh
```

Dit maakt lokaal aan:

- `.env`;
- een database-ownerwachtwoord;
- een afzonderlijk runtimewachtwoord;
- databaseverbindingen voor beide rollen;
- een server-pepper;
- een QR-encryptiesleutel.

De gegenereerde bestanden staan in `secrets/` en worden door Git genegeerd. **Commit deze bestanden nooit.**

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

```bash
docker compose up -d --build
```

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

Open je publieke ScanScore-adres en doorloop deze controle:

1. Maak een tijdelijke quizruimte.
2. Bewaar het eenmalig getoonde displaytoken.
3. Meld je aan als quizmaster.
4. Registreer twee testdeelnemers.
5. Scan een winnaar met vaste punten.
6. Controleer de blokkering van een dubbele scan.
7. Test **Laatste scan ongedaan maken**.
8. Open het publiek scorebord met het displaytoken.
9. Test daarna de verdeling `5, 3, 1`.

---

# ScanScore gebruiken

## Een spelruimte maken

Vul in het startscherm in:

- een herkenbare ruimte-ID, bijvoorbeeld `familiequiz`;
- de naam van de quiz;
- een hostwachtwoord van minstens 12 tekens of 8–16 cijfers.

Na het aanmaken toont ScanScore een **displaytoken**. Bewaar dit veilig. Het token geeft alleen leestoegang tot het publieke scorebord.

## Deelnemers registreren

1. Open **Deelnemers**.
2. Vul de naam in.
3. Kies **Persoon** of **Ploeg**.
4. Kies **Camera openen en QR koppelen**.
5. Scan de fysieke QR-kaart.

De kaart is daarna aan die deelnemer gekoppeld.

## Punten instellen

### Iedere winnaar gelijk

Kies **Iedere winnaar gelijk** en vul één puntenwaarde in, bijvoorbeeld `1` of `10`.

### Volgens scanvolgorde

Kies **Volgorde van scannen** en vul een lijst in:

```text
5, 3, 1
```

De eerste geldige scan krijgt 5 punten, de tweede 3 en de derde 1.

## Publiek scorebord openen

Open op het andere apparaat:

```text
https://quiz.jouwdomein.be/scoreboard.html
```

Vul de ruimte-ID en het displaytoken in. Het scorebord kan geen deelnemers, rondes of scores wijzigen.

---

# Beheer

## Stoppen en opnieuw starten

```bash
docker compose stop
docker compose start
```

## Bijwerken vanuit Git

Maak eerst een back-up. Haal daarna de nieuwe versie op en bouw de containers opnieuw:

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

Een release-tag zoals `v1.0.0` activeert de containerworkflow voor GitHub Container Registry.

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

ScanScore wordt gepubliceerd onder de [MIT-licentie](LICENSE).
