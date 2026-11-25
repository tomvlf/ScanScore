#!/bin/sh
set -eu
npm ci --ignore-scripts
npm run check
npm test
for f in README.md LICENSE SECURITY.md CONTRIBUTING.md CHANGELOG.md Dockerfile compose.yml package-lock.json .gitignore .dockerignore .github/workflows/ci.yml .github/workflows/container.yml test/feature-matrix.json test/feature-contract.test.js test/http-structure.test.js test/functional-e2e.js test/runtime-privileges.js; do [ -s "$f" ] || { echo "Missing $f" >&2; exit 1; }; done
if find . -path './.git' -prune -o -type f \( -name '.env' -o -path './secrets/*' -o -name '*.dump' -o -name '*.dump.enc' \) -print | grep -q .; then echo 'Repository contains generated secrets or dumps' >&2; exit 1; fi
printf '%s\n' 'Repository checks passed'
