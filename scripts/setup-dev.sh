#!/usr/bin/env bash
# Sentinel — local development setup.
# Copies .env.example files, installs dependencies, generates the Prisma client,
# and applies the schema to a local PostgreSQL instance.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies"
npm install

for spec in apps/api apps/bot apps/dashboard packages/database; do
  if [ -f "$spec/.env.example" ] && [ ! -f "$spec/.env" ]; then
    cp "$spec/.env.example" "$spec/.env"
    echo "  created $spec/.env from example (edit with real values)"
  fi
done

if [ -f apps/api/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source apps/api/.env
  set +a
fi

echo "==> Generating Prisma client"
npm run db:generate

echo "==> Applying schema"
npm run db:push

cat <<'DONE'

Sentinel development environment is ready.

    npm run dev               # API (port 12000) + bot
    npm run dev:dashboard     # dashboard (port 5173)
DONE