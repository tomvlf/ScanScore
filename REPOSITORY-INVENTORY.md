# Repository inventory

## Vereist en aanwezig

- Applicatie: `server.js`, `public/`, `package.json`, `package-lock.json`
- Container: `Dockerfile`, `compose.yml`, `.dockerignore`
- Database: `migrations/`, `postgres-init/`
- Installatie: `.env.example`, `scripts/generate-secrets.sh`, `scripts/preflight.sh`
- Tests: `test/`, `scripts/test-runtime-privileges.sh`
- Operaties: `scripts/backup.sh`, healthchecks en checklist
- GitHub: workflows, Dependabot en issuetemplate
- Projectinformatie: README, licentie, changelog, security- en bijdragebeleid

## Bewust niet aanwezig in Git

Deze bestanden worden lokaal gegenereerd of bevatten gevoelige/operationele data:

- `.env`
- `secrets/`
- `backups/`
- PostgreSQL-volumegegevens
- `node_modules/`
- database-dumps

## Optioneel, niet vereist voor 1.0.0

- favicon en PWA-manifest
- screenshots
- Caddy/Traefik/Nginx-voorbeeldconfiguraties
- `CODEOWNERS`
- GitHub fundingbestand
