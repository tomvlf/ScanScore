# Feature test coverage

Geen eindige testsuite kan letterlijk iedere mogelijke invoer, browser, netwerkstoring of aanvaller simuleren. Deze repository gebruikt daarom meerdere testlagen en houdt de functionele dekking expliciet bij in `test/feature-matrix.json`.

## Automatisch bij iedere push en pull request

### Statische en contracttests

`npm run test:unit` controleert:

- aanwezigheid van iedere serveractie en de overeenkomstige UI-bediening;
- host- en displayrollen;
- database-entiteiten en append-only score-events;
- idempotency, undo en auditstructuur;
- minimale runtimeprivileges;
- WebSocket- en browsersecurity-instellingen;
- Docker-secretkoppelingen;
- health- en readinessroutes;
- responsive en toegankelijke UI-elementen;
- parametrisatie van SQL;
- generieke foutafhandeling.

### Functionele end-to-endtest

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
- vaste punten toekennen;
- dubbele scan blokkeren;
- score ongedaan maken;
- volgende vraag;
- plaatsverdeling 5–3;
- geen extra plaats toelaten;
- nieuwe ronde activeren;
- idempotente scanrequest niet dubbel verwerken;
- display aanmelden en actuele staat ontvangen;
- displaymutatie weigeren.

### Databaseprivilegetest

`npm run test:privileges` controleert met de echte runtimegebruiker dat normale DML werkt en dat onder meer `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, schema-migraties en beheerdersrollen niet beschikbaar zijn.

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

De suite automatiseert alle huidige serveracties en primaire productflows. Hardware- en infrastructuurgedrag zoals echte cameratoestemming, verschillende mobiele browsers, TLS-certificaatvernieuwing, reverse-proxyfouten, off-host back-upherstel en onafhankelijke penetratietests blijven aparte acceptatiecontroles.
