# Docker-secretscontrole

## Gecontroleerd ontwerp
- Elk secret staat bovenaan onder `secrets` met een lokaal bronbestand.
- Iedere service krijgt alleen de secrets die zij nodig heeft.
- `db` krijgt owner- en runtimewachtwoord omdat de officiële PostgreSQL entrypoint de owner initialiseert en het init-script de runtimerol maakt.
- `migrate` krijgt uitsluitend de owner database-URL.
- `app` krijgt uitsluitend runtime database-URL, pepper en QR-encryptiesleutel.
- `privilege-test` krijgt uitsluitend de runtime database-URL.
- Geen secret wordt als Docker build argument gebruikt.
- Geen echte secretwaarde staat in `compose.yml` of `.env`.

## Belangrijke Compose-eigenschap
Compose-secrets zijn bestanden onder `/run/secrets/<naam>`. De applicatie en migratierunner moeten daarom de `*_FILE`-variabelen lezen; een secret wordt niet automatisch een environmentvariabele.

## Lokale Compose-beperking
Bij gewone Docker Compose op één host zijn file-based secrets bind mounts. Dit is beter dan plaintext environmentvariabelen en geeft servicespecifieke toegang, maar is niet hetzelfde als de versleutelde secret store van Docker Swarm of een externe secrets manager. Bescherm daarom de host, de projectmap en de secretbestanden met strikte Unixrechten.
