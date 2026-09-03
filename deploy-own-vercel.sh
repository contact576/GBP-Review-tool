#!/usr/bin/env bash
# Deploy Foundly to YOUR Vercel account as a fresh project.
#
# Run `npx vercel login` first. Then:
#   bash deploy-own-vercel.sh              # safe: no DATABASE_URL, memory provider
#   bash deploy-own-vercel.sh --with-db    # ALSO points it at the live Supabase
#
# The default deliberately omits DATABASE_URL. Without it the app runs on the
# in-memory provider with the seeded demo workspace, so this deployment cannot
# read or write the production database. Pass --with-db only if you actually
# want a second deployment sharing live customer data.

set -euo pipefail
cd "$(dirname "$0")"

WITH_DB=0
[ "${1:-}" = "--with-db" ] && WITH_DB=1

PROJECT="${VERCEL_PROJECT_NAME:-foundly-apify}"

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run:  npx vercel login" >&2
  exit 1
fi
echo "Deploying as: $(npx vercel whoami 2>/dev/null)"

# The repo is already linked to someone else's project. Set that link aside so
# this creates a NEW project under your account instead of pushing to theirs.
if [ -d .vercel ]; then
  mv .vercel ".vercel.bak.$(date +%s)"
  echo "Moved the existing project link aside (it pointed at another account)."
fi

npx vercel link --yes --project "$PROJECT"

# Copy env vars from .env.local. Secrets are piped in, never passed as argv.
push_env() {
  local key="$1" value="$2"
  [ -z "$value" ] && return 0
  # Remove first so a re-run updates rather than erroring on a duplicate.
  npx vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$key" production >/dev/null
  echo "  set $key"
}

echo "Setting environment variables:"
while IFS= read -r line; do
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  case "$key" in
    # Vercel injects this itself; a stale local copy would only mislead.
    VERCEL_OIDC_TOKEN) continue ;;
    # Local bookkeeping, not read by the app.
    APIFY_USER_ID) continue ;;
    # Must match the deployed origin, so it is set after the first deploy.
    NEXT_PUBLIC_APP_URL) continue ;;
    DATABASE_URL)
      if [ "$WITH_DB" = "1" ]; then push_env "$key" "$value"
      else echo "  SKIPPED DATABASE_URL (pass --with-db to include it)"; fi
      ;;
    *) push_env "$key" "$value" ;;
  esac
done < .env.local

echo "Building and deploying to production…"
npx vercel deploy --prod --yes
