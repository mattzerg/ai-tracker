#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

CF_EMAIL=$(security find-generic-password -s 'cloudflare-email' -a matteisn -w 2>/dev/null || true)
CF_KEY=$(security find-generic-password -s 'cloudflare-global-key' -a matteisn -w 2>/dev/null || true)
if [ -z "$CF_EMAIL" ] || [ -z "$CF_KEY" ]; then
  echo "Cloudflare creds not in Keychain. See ~/.claude/skills/cloudflare-skill/." >&2
  exit 1
fi
export CLOUDFLARE_EMAIL="$CF_EMAIL"
export CLOUDFLARE_API_KEY="$CF_KEY"
export CLOUDFLARE_ACCOUNT_ID="5adb85a472f67a9390d2c8cf2d704d45"

MSG="${1:-deploy}"

echo "==> verify"
pnpm verify:refs
echo "==> build"
pnpm build
echo "==> deploy ($MSG)"
wrangler pages deploy dist --project-name=ai-tracker --branch=main --commit-message="$MSG" --commit-dirty=true
echo
echo "Live at https://ai-tracker-dxu.pages.dev/"
