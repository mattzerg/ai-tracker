#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

CF_EMAIL=$(security find-generic-password -s 'cloudflare-email' -a matteisn -w 2>/dev/null || true)
CF_KEY=$(security find-generic-password -s 'cloudflare-global-key' -a matteisn -w 2>/dev/null || true)
CF_ACCOUNT=$(security find-generic-password -s 'cloudflare-account-id' -a matteisn -w 2>/dev/null || true)
KC_API_BASE=$(security find-generic-password -s 'ai-tracker-public-api-base' -a matteisn -w 2>/dev/null || true)
KC_TURNSTILE_SITEKEY=$(security find-generic-password -s 'ai-tracker-turnstile-sitekey' -a matteisn -w 2>/dev/null || true)
if [ -n "$CF_EMAIL" ] && [ -n "$CF_KEY" ]; then
  export CLOUDFLARE_EMAIL="$CF_EMAIL"
  export CLOUDFLARE_API_KEY="$CF_KEY"
else
  echo "Cloudflare API creds not in Keychain; using active Wrangler auth." >&2
fi
if [ -n "$CF_ACCOUNT" ]; then
  export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT"
fi
export SITE_URL="${SITE_URL:-https://ai-tracker-dxu.pages.dev}"
export PUBLIC_API_BASE="${PUBLIC_API_BASE:-$KC_API_BASE}"
export PUBLIC_TURNSTILE_SITEKEY="${PUBLIC_TURNSTILE_SITEKEY:-$KC_TURNSTILE_SITEKEY}"
export PUBLIC_GITHUB_ISSUES_URL="${PUBLIC_GITHUB_ISSUES_URL:-https://github.com/mattzerg/ai-tracker/issues/new?template=submission.yml}"

MSG="${1:-deploy}"
BRANCH="${BRANCH:-main}"

echo "==> verify"
pnpm verify:refs
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "WARNING: deploying with a dirty worktree (--commit-dirty=true)" >&2
fi
echo "==> build"
pnpm build
echo "==> deploy ($MSG)"
wrangler pages deploy dist --project-name=ai-tracker --branch="$BRANCH" --commit-message="$MSG" --commit-dirty=true
echo
echo "Live at https://ai-tracker-dxu.pages.dev/"
