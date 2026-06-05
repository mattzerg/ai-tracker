#!/usr/bin/env bash
# Deploy ai-tracker to Cloudflare Pages. Auth via `wrangler login` (OAuth) or
# CLOUDFLARE_API_TOKEN in the environment. Public config via PUBLIC_* env vars.
set -euo pipefail
cd "$(dirname "$0")"

export SITE_URL="${SITE_URL:-https://ai-tracker-dxu.pages.dev}"
export PUBLIC_API_BASE="${PUBLIC_API_BASE:-}"
export PUBLIC_TURNSTILE_SITEKEY="${PUBLIC_TURNSTILE_SITEKEY:-}"
export PUBLIC_GITHUB_ISSUES_URL="${PUBLIC_GITHUB_ISSUES_URL:-}"

MSG="${1:-deploy}"
echo "==> verify"; pnpm verify:refs
echo "==> build";  pnpm build
echo "==> deploy ($MSG)"
wrangler pages deploy dist --project-name=ai-tracker --branch="${BRANCH:-main}" \
  --commit-message="$MSG" --commit-dirty=true
echo "Live at $SITE_URL/"
