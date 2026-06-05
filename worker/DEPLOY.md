# Deploying the ai-tracker submission Worker

The Worker powers `/submit` (model/tool/repo/event submissions → moderated GitHub
queue) and `/upvote`. It is **deploy-ready**: 17 tests pass, both KV namespaces
exist (IDs in `wrangler.toml`), the `submissions/queue` branch exists on the
repo, and all `[vars]` are set. Only three secrets and one command remain — plus
wiring the live site to point at it.

Until this runs, the `/submit` form degrades gracefully (validate + Copy JSON),
so the site is fully usable without it.

## Prerequisites (already satisfied — listed for the record)

- KV namespaces `VOTES` + `RATELIMIT` created (IDs in `wrangler.toml`).
- `GITHUB_REPO = mattzerg/ai-tracker`; `submissions/queue` branch exists.
- `ANTHROPIC_MODEL = claude-haiku-4-5-...` (cheap moderation).

## Step 1 — create a Cloudflare Turnstile widget

In the Cloudflare dashboard → Turnstile → add a widget for the site's domain
(use `*.pages.dev` during beta). It gives you a **site key** (public) and a
**secret key** (server). You'll use both — they're a pair.

## Step 2 — set the three Worker secrets

From this `worker/` directory:

```
wrangler secret put GITHUB_TOKEN       # fine-grained PAT, contents:write on mattzerg/ai-tracker
wrangler secret put TURNSTILE_SECRET   # the Turnstile *secret* key from step 1
wrangler secret put ANTHROPIC_API_KEY  # a real metered key — Haiku moderation, ~$0.02 / 100 submissions
```

- `GITHUB_TOKEN` scope: just `contents:write` (it commits submissions to the
  `submissions/queue` branch). Don't over-scope it.

## Step 3 — deploy

```
pnpm deploy        # runs scripts/check-kv-bindings.mjs, then `wrangler deploy`
```

Note the resulting `https://ai-tracker-api.<account>.workers.dev` URL.

## Step 4 — wire the live site to the Worker

The site reads three PUBLIC_* vars at build time. Set them, then redeploy the
**site** (not the worker):

```
export PUBLIC_API_BASE="https://ai-tracker-api.<account>.workers.dev"
export PUBLIC_TURNSTILE_SITEKEY="<site key from step 1>"
# from the site root:
bash deploy.sh "enable live /submit"
```

Now the form posts to the Worker and shows the real Turnstile challenge instead
of degrading.

## Step 5 — smoke-test the live path

- Submit a throwaway event on the live site → expect a PR/commit on the
  `submissions/queue` branch.
- Confirm the per-IP daily cap (`RATE_LIMIT_PER_DAY = 5`) and Haiku moderation
  fire (a junk submission should be rejected or low-confidence-flagged).

## Rollback

`wrangler delete` removes the Worker; unset `PUBLIC_API_BASE` and redeploy the
site to return to the graceful Copy-JSON fallback. KV data persists unless the
namespaces are deleted.
