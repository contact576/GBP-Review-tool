#!/usr/bin/env bash
# Push the STRIPE_* vars from an env file into the linked Vercel project.
#
#   npx vercel login                      # once, account owning team_fefhCpJPi3Yc0EzQPqMdRxAF
#   bash scripts/stripe-push-env.sh <env-file> [production|preview ...]
#
# Reads KEY=value lines (only STRIPE_*), removes any existing value for that
# environment, then adds the new one — so it is safe to rerun after a key
# rotation. Defaults to production AND preview. Redeploy afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:-.env.local}"
shift || true
targets=("$@")
[ ${#targets[@]} -eq 0 ] && targets=(production preview)

if ! npx vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run:  npx vercel login" >&2
  exit 1
fi

count=0
while IFS= read -r line; do
  line="${line%%$'\r'}"
  case "$line" in STRIPE_*=*) ;; *) continue ;; esac
  name="${line%%=*}"
  value="${line#*=}"
  for target in "${targets[@]}"; do
    npx vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$target" >/dev/null
    echo "  set $name ($target)"
  done
  count=$((count + 1))
done < "$file"

echo "$count STRIPE_* vars pushed to: ${targets[*]}"
echo "Next: bash deploy-production.sh  (or npx vercel --prod --yes), then"
echo "      node scripts/stripe-verify.mjs --env-file $file --app-url https://foundly-phi.vercel.app"
