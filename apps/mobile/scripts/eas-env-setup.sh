#!/usr/bin/env bash
# One-time EAS environment setup for HeyDPE iOS (preview + production).
# Run from apps/mobile after `npx eas-cli login` and `npx eas-cli init`.
#
# Public values are read from the local .env (client-safe: Supabase anon key,
# API URL, PostHog key) or are fixed identifiers (Sentry DSN/org/project).
# The Sentry auth token is a SECRET: it is prompted for silently and stored
# with --visibility secret. Nothing here is printed or written to the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "apps/mobile/.env not found"; exit 1; fi
set -a; . ./.env; set +a
: "${EXPO_PUBLIC_SUPABASE_URL:?missing in .env}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?missing in .env}"
EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://aviation-oral-exam-companion.vercel.app}"

# Fixed identifiers established on 2026-09-11 (not secrets).
SENTRY_ORG="imagine-flying-llc"
SENTRY_PROJECT="heydpe-ios"
EXPO_PUBLIC_SENTRY_DSN="https://942f4c0345edc6855c2b33d4b992d0a7@o4511550062985216.ingest.us.sentry.io/4512069582651392"
EXPO_PUBLIC_POSTHOG_KEY="phc_2SG12aalzgK4TpgyQ5w5W023ntUCE9XALMyDaBXIay5"
EXPO_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"

read -r -s -p "Paste the Sentry organization auth token (input hidden): " SENTRY_AUTH_TOKEN; echo
[ -n "$SENTRY_AUTH_TOKEN" ] || { echo "empty token"; exit 1; }

put() { # env name value visibility
  local env="$1" name="$2" value="$3" vis="$4"
  npx eas-cli env:create --scope project --environment "$env" --name "$name" --value "$value" --visibility "$vis" --type string --non-interactive --force >/dev/null \
    && echo "  $env  $name  ($vis)"
}

for env in preview production; do
  echo "== $env"
  put "$env" EXPO_PUBLIC_SUPABASE_URL      "$EXPO_PUBLIC_SUPABASE_URL"      plaintext
  put "$env" EXPO_PUBLIC_SUPABASE_ANON_KEY "$EXPO_PUBLIC_SUPABASE_ANON_KEY" plaintext
  put "$env" EXPO_PUBLIC_API_URL           "$EXPO_PUBLIC_API_URL"           plaintext
  put "$env" EXPO_PUBLIC_POSTHOG_KEY       "$EXPO_PUBLIC_POSTHOG_KEY"       plaintext
  put "$env" EXPO_PUBLIC_POSTHOG_HOST      "$EXPO_PUBLIC_POSTHOG_HOST"      plaintext
  put "$env" EXPO_PUBLIC_SENTRY_DSN        "$EXPO_PUBLIC_SENTRY_DSN"        plaintext
  put "$env" SENTRY_ORG                    "$SENTRY_ORG"                    plaintext
  put "$env" SENTRY_PROJECT                "$SENTRY_PROJECT"                plaintext
  put "$env" SENTRY_AUTH_TOKEN             "$SENTRY_AUTH_TOKEN"             secret
done
echo "Done. Verify with: npx eas-cli env:list --environment preview"
