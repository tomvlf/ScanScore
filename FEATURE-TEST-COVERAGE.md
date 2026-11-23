# Feature test coverage

Geen eindige testsuite kan letterlijk iedere mogelijke invoer, browser, netwerkstoring of aanvaller simuleren. Deze repository gebruikt daarom meerdere testlagen en houdt de functionele dekking expliciet bij in `test/feature-matrix.json`.

## Bij iedere push en pull request

### Statische en contracttests

`npm run test:unit` controleert:

- aanwezigheid van iedere serveractie en de overeenkomstige UI-bediening;
- host- en displayrollen;
- database-entiteiten en append-only score-events;
- idempotency, undo en auditstructuur;
- minimale runtimeprivileges;
- WebSocket- en browsersecurity-instellingen;
- Docker-secretkoppelingen;
- quizopslag, vraagkoppelingen en sessie-snapshots;
- quiz-API voor opslaan en starten met gesimuleerde database;
- afbeeldingsformaten, uploadroute en quiz-API;
- health- en readinessroutes;
- responsive en toegankelijke UI-elementen;
- parametrisatie van SQL;
- generieke foutafhandeling.

### Functionele end-to-endtest

Voer deze extra integratietest lokaal uit met Docker/PostgreSQL:

`npm run test:e2e` start de echte app en database en controleert:

- readiness;
- spelruimte aanmaken;
- dubbele ruimte weigeren;
- host aanmelden;
- fout hostwachtwoord weigeren;
- persoon en ploeg toevoegen;
- ongeldige deelnemer weigeren;
- dubbele QR-koppeling weigeren;
- onbekende QR-code weigeren;
- precies één actief spel per ruimte;
- deelnemers tijdens een spel toevoegen en na verwijderen QR opnieuw koppelen;
- gelijke, live herverdeelde puntenpot, inclusief breukdelen;
- dubbele winnaarscan blokkeren;
- winnaar uit huidige of eerdere vraag verwijderen;
- eerdere vraag corrigeren en volgende vraag hervatten;
- verouderde vraag-scan weigeren;
- spel stoppen en nieuw spel met nulscores starten;
- historie en scores van verwijderde spelers behouden;
- totalen of punten per vraag tonen;
- quiz aanmaken, bewerken en verwijderen;
- quizafbeelding uploaden, valideren, verkleinen en serveren;
- quizsessie starten met eigen punten per vraag;
- laatste vraag afronden en `quiz_finished` weigeren;
- display aanmelden, de actieve vraag ontvangen en geen quizlijst ontvangen;
- schermkeuze van de quizmaster via de ruimte naar een publiek scherm sturen;
- displaymutatie weigeren.

### Databaseprivilegetest

Voer ook deze test lokaal uit met Docker/PostgreSQL:

`npm run test:privileges` controleert met de echte runtimegebruiker dat normale DML werkt en dat onder meer `CREATE`, `ALTER`, `DROP`, `TRUNCATE` en beheerdersrollen niet beschikbaar zijn.

## Lokaal uitvoeren

```bash
npm ci
npm run test:all
```

De Docker-tests vereisen eerst gegenereerde secrets en een geldige `.env`:

```bash
./scripts/generate-secrets.sh
# Pas ALLOWED_ORIGINS aan
./scripts/preflight.sh
docker compose up -d --build
npm run test:all
```

## Grenzen van automatisering

De suite automatiseert alle huidige serveracties en primaire productflows, inclusief quizaanmaak, afbeeldingsupload en een volledige quizsessie. Hardware- en infrastructuurgedrag zoals echte cameratoestemming, verschillende mobiele browsers, TLS-certificaatvernieuwing, reverse-proxyfouten, off-host back-upherstel en onafhankelijke penetratietests blijven aparte acceptatiecontroles.
