# Environment-variabelencontrole

## Gecontroleerd ontwerp
- Secretwaarden worden in `.env` bewaard en via Compose-interpolatie als containeromgevingsvariabelen ingesteld.
- `db` krijgt het owner- en runtimewachtwoord omdat de officiële PostgreSQL-entrypoint de owner initialiseert en het init-script de runtimerol maakt.
- Er is geen migratieservice; alleen PostgreSQL initialiseert een lege releasevolume.
- `app` krijgt uitsluitend de runtime database-URL, pepper en QR-encryptiesleutel.
- `privilege-test` krijgt uitsluitend de runtime database-URL.
- Geen secret wordt als Docker build-argument gebruikt.
- `.env` is lokaal uitgesloten van Git en hoort permissies `0600` te hebben.

## Beperking
Omgevingsvariabelen zijn zichtbaar voor bevoegde hostbeheerders en kunnen in containerinspectie voorkomen. Bescherm de host en `.env`; gebruik voor sterkere secret-isolatie een secret manager of een platform met een secret store.
