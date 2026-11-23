# ScoreScan

**Scan fysieke QR-kaarten, ken automatisch punten toe en toon het klassement live op een tweede scherm.**

ScoreScan is een selfhosted webapp voor quizzen, spellen en activiteiten waarbij deelnemers een persoonlijke QR-code gebruiken. De spelmeester scant de winnaars van iedere vraag; de server verdeelt de puntenpot gelijk en werkt het publieke scorebord onmiddellijk bij.

## Wat kun je ermee?

- quizzen maken met eigen vragen, afbeeldingen en punten per vraag;
- dezelfde quiz hergebruiken voor meerdere spelsessies;
- deelnemers of ploegen aan een fysieke QR-kaart koppelen;
- winnaars scannen met de camera van een smartphone;
- één sessie tegelijk in een ruimte spelen;
- deelnemers en hun QR-koppelingen tussen spellen behouden;
- de puntenpot per vraag gelijk verdelen over alle gescande winnaars;
- de vraag met afbeelding tonen op het bedieningsscherm en het publieke scherm;
- eerdere vragen tijdens het spel corrigeren;
- totalen of punten per vraag bekijken;
- gestopte spellen als historiek bewaren;
- het klassement live tonen op een laptop, tv of beamer;
- alles op je eigen server hosten.

## Hoe werkt een spel?

1. De spelmeester maakt een beveiligde ruimte, een quiz met vragen en afbeeldingen, en koppelt de deelnemers aan hun QR-kaarten.
2. Bij de start kiest de spelmeester de quiz. De punten per vraag komen uit de quiz; bij een snel spel zonder quiz stelt hij één puntenpot in.
3. Iedere vraag toont de tekst en afbeelding op het bedieningsscherm. De winnaars worden gescand en de pot wordt live gelijk onder hen verdeeld.
4. De spelmeester kiest **Volgende vraag** zodra alle winnaars van die vraag gescand zijn. Na de laatste vraag rondt hij de quiz af.
5. Eerdere vragen zijn tijdens het spel opnieuw te openen om winnaars te corrigeren.
6. Het publieke scherm toont het klassement, of met de weergave **Vraag tonen** de actieve vraag groot in beeld.

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
Elke containerworkflow-run krijgt ook een oplopend versienummer `1.0.<runnummer>`
en een vaste tag `sha-<volledige-commit-SHA>`. Stel `SCANSCORE_IMAGE_TAG` in
`.env` in op dat versienummer als Dockhand een versie-tag volgt; de standaard is `latest`.
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

Sta voor quizafbeeldingen een request body van minstens 6 MB toe
(bijvoorbeeld `client_max_body_size 6m` in nginx). De applicatie weigert
afbeeldingen groter dan 5 MB en accepteert alleen JPG, PNG en WebP.

Gebruik precies zoveel `TRUST_PROXY_HOPS` als er vertrouwde proxy's tussen de
publieke client en de app staan (standaard `1`). De proxy moet de ontvangen
`X-Forwarded-For`-keten bijwerken met het echte clientadres en dat adres niet in
een willekeurig clientheader laten vervangen. Bij een rechtstreeks verbinding
zonder proxy zet je de waarde op `0`.

Publiceer poort `8088` niet rechtstreeks op internet. Gebruik de toepassing in productie uitsluitend via HTTPS/WSS, anders is de camerafunctie op veel mobiele browsers niet beschikbaar.

## 8. Eerste functionele test

Open je publieke ScoreScan-adres en doorloop deze controle:

1. Maak een tijdelijke spelruimte.
2. Bewaar de gekozen ruimtenaam en het wachtwoord.
3. Controleer dat je automatisch als spelmeester bent aangemeld.
4. Registreer drie testdeelnemers en start een spel met een puntenpot van 50.
5. Scan twee winnaars en controleer dat zij elk 25 punten krijgen.
6. Scan een derde winnaar en controleer dat de punten herverdelen naar circa 16,67 per speler.
7. Open vraag 1 opnieuw, verwijder een winnaar en controleer de herverdeling.
8. Open het publieke scorebord en wissel tussen totalen en punten per vraag.
9. Stop het spel en start een nieuw spel; de spelers blijven, de nieuwe scores beginnen op nul.

---

# ScoreScan gebruiken

## Een quiz maken

1. Open **Quizzen** en kies **Nieuwe quiz**.
2. Vul een quiztitel in en voeg per vraag een tekst, een afbeelding en een puntenwaarde toe.
3. Afbeeldingen mogen JPG, PNG of WebP zijn en maximaal 5 MB groot. De afbeelding wordt in de database bewaard en meegestuurd in back-ups.
4. Voeg vragen toe, verplaats ze met de pijlen of verwijder ze. Kies **Quiz opslaan**.
5. Een quiz blijft bewerkbaar en is opnieuw te spelen. Een gestarte sessie houdt een snapshot van de vraagtekst, afbeelding en punten, zodat spelhistoriek nooit verandert.

Start een sessie met **Start** op de quizkaart, of kies de quiz op **Spelen**. De spelers, QR-kaarten en het scoreverloop werken zoals bij een snel spel.

## Installeren als Android-app

Open het publieke **HTTPS-adres** in Chrome op Android. Kies in het Chrome-menu
**Toevoegen aan startscherm → Installeren** (of **App installeren**, afhankelijk
van de Chrome-versie). ScoreScan opent daarna als zelfstandige app zonder
browseradresbalk en krijgt een eigen app-icoon.

Verwijder een eerder gemaakte snelkoppeling en vernieuw de website als Chrome
nog de oude versie toont. Installatie als Android-WebAPK vereist Chrome met
Google Mobile Services; zonder die ondersteuning kan Chrome alleen een
snelkoppeling aanbieden. Een lokaal HTTP-IP-adres is niet installeerbaar.

De geïnstalleerde app blijft een internetverbinding nodig hebben voor aanmelden,
QR-koppelingen en live scores. Er worden geen offline scores of oude
appbestanden gecachet; nieuwe versies worden bij het openen opgehaald.

## Een spelruimte maken

Vul in het startscherm in:

- een unieke ruimtenaam van maximaal 80 tekens, bijvoorbeeld `Familiequiz`;
- een hostwachtwoord van minstens 12 tekens of 8–16 cijfers.

Klik op **Ruimte maken**. Je wordt automatisch aangemeld met de gekozen
ruimtenaam en het wachtwoord. Je blijft op dit apparaat 30 dagen aangemeld,
ook na vernieuwen of het heropenen van de browser. Daarna vul je dezelfde naam en
hetzelfde wachtwoord in en klik je op **Aanmelden**. Hoofdletters in de
ruimtenaam maken geen verschil; spaties aan het begin en einde worden genegeerd.

Bestaat de ruimtenaam al? Kies een andere naam voor een nieuwe ruimte, of meld
je aan met het oorspronkelijke wachtwoord. Bestaande ruimtes behouden hun
wachtwoord en spelgegevens. Hun quiznaam wordt de aanmeldnaam; bij dubbele
quiznamen of een conflict met een bestaand ruimte-ID blijft het oude ruimte-ID
de aanmeldnaam.

De aanmelding gebruikt een intrekbare HttpOnly-cookie; het wachtwoord wordt niet
in browseropslag bewaard. **Afmelden** trekt deze browsersessie voor beide
schermen in. Gebruik dit op gedeelde apparaten. Privévensters en het wissen van
cookies kunnen de aanmelding eerder verwijderen.

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

Op een gsm staat de scanner direct onder een compacte vraag- en puntenbalk.
**Volgende vraag** blijft onderaan binnen duimbereik, boven de navigatie.
De camera blijft aan bij de volgende vraag. Open **Vraag corrigeren of spel
stoppen** onder de winnaarslijst voor eerdere vragen en het beëindigen van het spel.

1. Open **Spelen** en kies een quiz, of laat de quiz leeg voor een snel spel met één puntenpot.
2. De actieve vraag met afbeelding en tekst staat boven de scanner. Scan iedere
   winnaar van de huidige vraag. Iedere geldige scan krijgt aanvankelijk de
   volledige pot; de app herberekent de gelijke aandelen onmiddellijk zodra er
   meer winnaars bijkomen.
3. Voorbeeld: bij 50 punten krijgen twee winnaars 25 punten elk. Bij drie
   winnaars is dat 16,67 per winnaar. Breukdelen blijven intern behouden; de
   weergave rondt af op twee decimalen.
4. Kies **Volgende vraag** wanneer alle winnaars gescand zijn. Bij de laatste
   vraag wordt de knop **Quiz afronden**.
5. Kies een eerdere vraag in de vraagkiezer om een winnaar te verwijderen of
   opnieuw te scannen. De verdeling en totaalscores worden direct bijgewerkt.
6. Rond de quiz af wanneer het afgelopen is. Een nieuwe sessie begint met nul
   punten; spelers, QR-koppelingen en eerdere spelresultaten blijven bewaard.

## Publiek scorebord openen

Open op het andere apparaat:

```text
https://quiz.jouwdomein.be/scoreboard.html
```

Vul dezelfde ruimtenaam en hetzelfde wachtwoord in als op het bedieningsscherm.
Op hetzelfde apparaat wordt je bestaande aanmelding automatisch hergebruikt.
Ook dit scherm blijft na vernieuwen of heropenen aangemeld. Het scorebord kan
geen deelnemers of scores wijzigen. Kies **Totaalpunten**, **Punten per vraag** of **Vraag tonen** en selecteer
desgewenst een eerder spel. **Vraag tonen** zet de actieve vraag met afbeelding
groot in beeld, ideaal tijdens het antwoorden.

Het gedeelde wachtwoord geeft ook toegang tot de spelbediening: deel het alleen
met vertrouwde personen. De oude displaytoken-aanmelding blijft voor bestaande
API-clients beschikbaar, maar is niet meer nodig in de gebruikersinterface.

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
Quizafbeeldingen zitten in de database en worden dus mee in de dump bewaard.

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
public/          browserinterface en quizbouwer
migrations/      PostgreSQL-schemawijzigingen (inclusief quizafbeeldingen)
postgres-init/   eenmalige veilige database-initialisatie
scripts/         installatie-, test- en beheerhulpmiddelen
test/            statische en integratietests
.github/         CI, containerrelease en Dependabot
```

Elke push naar `main` publiceert `ghcr.io/tomvlf/scanscore:latest` en een
`sha-<volledige-commit-SHA>`-tag plus een oplopende versie-tag `1.0.<runnummer>`
via GitHub Actions. Een release-tag zoals `v1.0.0` publiceert daarnaast de
semantische versietags `1.0.0` en `1.0` in GitHub Container Registry.

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
