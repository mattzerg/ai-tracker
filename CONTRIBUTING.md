# Contributing to ai-tracker

For *data* contributions (new models, tools, events) see [SUBMITTING.md](./SUBMITTING.md). This doc covers *code* contributions: new ingest sources, schema changes, ingest-pipeline work, etc.

## Setup

```bash
pnpm install
pnpm run dev          # localhost:4321
```

## Common loops

```bash
pnpm run verify:refs           # entity references resolve + released-event drift check
pnpm run verify:sources        # HEAD-check every source URL
pnpm run verify:headers        # smoke-test deployed _headers (defaults to prod)
pnpm run verify:all            # all three above
pnpm run ingest:dry            # walk every source, write tmp/ingest-report.json
pnpm run ingest:apply:updates  # apply updates to existing entries (skip new-from-supplementary)
pnpm test                      # vitest schema tests
```

## Adding a new ingest source

Source files live in `scripts/ingest/sources/`. Each exports a single `Source` object — read `mistral-models.ts` for a typical authoritative example, `github-trending.ts` for a supplementary one.

```ts
export const mySource: Source = {
  id: "my-source",
  description: "One-line description shown in the ingest report.",
  trust: "authoritative", // or "supplementary"
  async run(ctx): Promise<SourceResult> {
    // ...
    return { source: "my-source", models: [...], warnings: [], estimatedCostUsd: 0 };
  },
};
```

Then wire it into the `SOURCES` array in `scripts/ingest.ts` and run `pnpm run ingest:dry` to see the diff. Pricing changes auto-synthesize `price_change` events; releases need `events:backfill-releases`.

### Trust levels

- **authoritative** — sources can correct stale curated values (license, pricing, modalities, status). One per major provider.
- **supplementary** — only fills gaps; never overwrites curated data. Aggregators like OpenRouter, GitHub topic search.

The merge layer (`scripts/ingest/merge.ts`) enforces this. Don't bypass it.

### Cost cap

`MAX_INGEST_USD` env var (default 2) halts the run after total `estimatedCostUsd` exceeds the cap. Annotate any LLM-using source with a reasonable `estimatedCostUsd` per call.

## Schema changes

Schemas live in `schemas/`. Both server-side (`scripts/`, `src/lib/data.ts`) and client-side (`src/pages/submit.astro` validation mirror) consume them.

When you change `schemas/model.ts`, `schemas/tool.ts`, or `schemas/event.ts`:

1. Update the schema file with a `.optional()` / `.nullable()` default if you're adding a non-required field. Required-field additions need a migration script (see `scripts/migrate-tool-homepage.ts` for the canonical pattern).
2. Run `pnpm verify:refs` — Zod will surface every data file that fails the new schema.
3. If the change affects tracked diff fields (pricing precision, links, sources, etc.), update `TOOL_TRACKED_FIELDS` / `MODEL_TRACKED_FIELDS` in `scripts/ingest/diff.ts`.
4. Update the Zod-mirror validator in `src/pages/submit.astro` to match.

## Adding agent-consumable surfaces

Every per-entity surface should appear in:

- `src/pages/sitemap-agents.xml.ts` with priority + changefreq
- The "Agent-consumable surfaces" table in `README.md`
- The `How to query` section of `/llms.txt` (`src/pages/llms.txt.ts`)

## OG cards

Card rendering is in `src/lib/ogSvg.ts`. The PNG path uses `@resvg/resvg-js` with content-hash caching at `tmp/png-cache/`. Cache sweep is `pnpm cache:sweep` (default 30-day threshold). Wipe the cache when you change colors, layout, or anything that affects the SVG.

## Deploy

`./deploy.sh` runs verify:refs → build → `wrangler pages deploy`. Cloudflare Pages on the work account.

The repo also has three GitHub Actions in `.github/workflows/`:
- `ci.yml` — verify:refs + tests + build + verify:sources (on PR)
- `ingest.yml` — nightly 03:17 UTC cron; opens commit on `submissions/queue`
- `watchdog.yml` — every 4h; pings queue PRs unreviewed past 24h/48h/7d

## Style

- TypeScript strict mode.
- No comments unless explaining a non-obvious WHY.
- One-shot scripts use `--dry-run` flags + idempotent design.
- Pre-PR ritual: `verify:refs` must pass; build must succeed; new entry points should also have a sitemap entry + a line in `/llms.txt` if they're agent-relevant.

## Pull requests

Open them. The `pr-gate` skill in this org runs review automation; smaller PRs land faster.
