#!/usr/bin/env bash
# Ship this working tree to the REAL production: foundly-phi.vercel.app
#
#   npx vercel login          # account owning team_fefhCpJPi3Yc0EzQPqMdRxAF
#   bash deploy-production.sh
#
# One target, one deploy. The repo is already linked to the foundly project via
# .vercel/project.json, so this does not create or link anything new — it also
# refuses to run if that link has drifted, so it cannot deploy to the wrong
# project by accident.
#
# It also connects the GitHub repo to the project, so future `git push` deploys
# production automatically and this script stops being necessary.

set -euo pipefail
cd "$(dirname "$0")"

EXPECTED_PROJECT="prj_5nNUDj8MyMQhtI96j2E1IBuXBnJj"
EXPECTED_ORG="team_fefhCpJPi3Yc0EzQPqMdRxAF"

# ── Guard: are we pointed at production? ────────────────────────────────────
if [ ! -f .vercel/project.json ]; then
  echo "No .vercel/project.json — the link to the foundly project is missing." >&2
  echo "Restore it, or run: npx vercel link --project foundly" >&2
  exit 1
fi
project=$(node -p "require('./.vercel/project.json').projectId")
org=$(node -p "require('./.vercel/project.json').orgId")
if [ "$project" != "$EXPECTED_PROJECT" ] || [ "$org" != "$EXPECTED_ORG" ]; then
  echo "REFUSING TO DEPLOY: .vercel points at $org/$project," >&2
  echo "not the production foundly project ($EXPECTED_ORG/$EXPECTED_PROJECT)." >&2
  exit 1
fi

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run:  npx vercel login" >&2
  exit 1
fi
echo "Authenticated as: $(npx vercel whoami 2>/dev/null)"
echo "Target: foundly-phi.vercel.app  ($EXPECTED_ORG/$EXPECTED_PROJECT)"

# ── APIFY_TOKEN — the one env var production is missing ─────────────────────
token=$(grep -E "^APIFY_TOKEN=" .env.local | cut -d= -f2- | tr -d '"' || true)
if [ -n "$token" ]; then
  for env in production preview; do
    npx vercel env rm APIFY_TOKEN "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$token" | npx vercel env add APIFY_TOKEN "$env" >/dev/null 2>&1 \
      && echo "  set APIFY_TOKEN ($env)"
  done
else
  echo "  WARNING: no APIFY_TOKEN in .env.local — the Apify import will stay inert."
fi

# ── Connect git so pushes deploy from here on ───────────────────────────────
# Not fatal if it fails (it needs the GitHub account to be linked in Vercel);
# the deploy below still ships this tree either way.
echo "Connecting the GitHub repo so future pushes deploy automatically…"
npx vercel git connect --yes 2>&1 | tail -3 || echo "  (skipped — connect it in the dashboard)"

echo "Deploying to production…"
npx vercel deploy --prod --yes
