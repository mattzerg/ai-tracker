# ai-tracker

Public-beta directory + changelog for AI models, tools, and developer repos — designed to be consumed by agents. Free to use, no signup, no ads, no SaaS pitch. Maintained by [Zerg AI](https://zergai.com), open to community contributions via [SUBMITTING.md](./SUBMITTING.md).

**Live**: <https://ai-tracker-dxu.pages.dev> · **Repo**: <https://github.com/mattzerg/ai-tracker> · **Code of Conduct**: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

Current counts are generated on the live site and in `/llms.txt`; see `/about` for the human-readable breakdown.

## What it is

Other directories list AI products. ai-tracker is built so an LLM agent can answer *"what changed for Claude Opus 4.8 in the last month"* or *"which agent repos should I inspect?"* without scraping HTML. Every entity has HTML, JSON, and Markdown twins; every event flows through RSS, Atom, `/dump/all.json`, `/llms.txt`, JSON-LD, and an MCP server. Auth-free, signup-free, ad-free.

Public beta means source-backed, not exhaustive. Ranking views are metadata slices from tracked pricing, context windows, repo stats, and cross-links; they are not universal quality benchmarks. Production decisions should still verify current provider docs.

## What's tracked

**Authoritative readers (9 providers)**: Anthropic, Google, xAI, Mistral, OpenAI, DeepSeek, Meta, Alibaba, Cohere — each with a hand-curated `KNOWN` map of models pulled from official docs.

**Supplementary aggregators (3)**: OpenRouter API (model catalog), GitHub topic search (OSS tools), GitHub repo search (first-class developer repos).

**Source-trust hierarchy**: authoritative entries can correct stale supplementary values; supplementary sources never overwrite curated data.

## Repo structure

```
ai-tracker/
  data/
    models/<provider>__<id>.json    canonical model entries
    tools/<slug>.json               canonical tool entries
    repos/github__<owner>_<repo>.json canonical AI repo entries
    repo-candidates/github-repos.json GitHub-discovered repo review queue
    events/<date>__<entity>__<type>.json   append-only event log
  schemas/                          Zod schemas (model, tool, repo, event, common)
  scripts/
    ingest.ts                       nightly ingest orchestrator
    ingest/sources/*.ts             one file per source (authoritative + supplementary)
    generate-release-events.ts      backfill released events
    generate-pricing-events.ts      backfill price_change from git history
    fill-built-on-models.ts         tool→model cross-link curation
    migrate-tool-homepage.ts        one-shot schema migration
    png-cache-sweep.ts              tmp/png-cache hygiene
  src/
    pages/                          Astro routes (HTML + JSON + MD twins)
    components/                     ProviderMark, JsonLd, etc.
    lib/                            data loaders, og rendering, color palettes
    layouts/Base.astro              site-wide layout (nav + latest banner + footer)
  worker/                           Cloudflare Worker for /submit, /upvote, /votes
  mcp-server/                       npm package: ai-tracker-mcp
  public/_headers                   Cloudflare Pages response headers
  .github/workflows/                ci, ingest, watchdog
  deploy.sh                         CF Pages deploy wrapper
```

## Run locally

```bash
pnpm install
pnpm run dev          # Astro dev server on :4321
pnpm run build        # static build to dist/
pnpm run ingest:dry   # dry-run nightly ingest, writes report only
```

## Common tasks

```bash
pnpm run verify:refs           # entity references resolve (events ↔ models/tools/repos)
pnpm run verify:sources        # HEAD-check every source URL (soft-pass on 401/403/405/429)
pnpm run ingest:apply:updates  # apply pricing/link/tag updates only (skip new entries)
pnpm run events:backfill-releases   # add 'released' events for any model missing one
pnpm run cache:sweep           # delete OG PNG cache files older than 30 days
```

Full script reference in `package.json`.

## Agent-consumable surfaces

| URL | Purpose |
|---|---|
| `/llms.txt` | Discovery file: stats, query patterns, highlights, recent events |
| `/llms-full.txt` | Full corpus as plain text |
| `/dump/all.json` | Bulk export — every model, tool, repo, event, queue status |
| `/dump/events-30d.json` | Last 30 days of events |
| `/api/search.json` | Lean denormalized search index (~25KB) |
| `/repos/candidates.json` | GitHub-discovered repo candidates awaiting review |
| `/api/votes.json` | Vote counts (Worker stub today, real Worker Phase 4) |
| `/feed.xml`, `/atom.xml` | Last 100 events |
| `/sitemap-agents.xml` | Every machine-consumable URL with priority + changefreq |
| `/models/<id>.json`, `/models/<id>.md` | Per-entity twins |
| `/tools/<id>.json`, `/tools/<id>.md` | Per-entity twins |
| `/repos/<id>.json`, `/repos/<id>.md` | Per-repo twins |
| `/events/<slug>` | Per-event detail page (also linked from RSS) |
| `/og/models/<id>.png`, `/og/tools/<id>.png` | 1200×630 share cards |
| MCP server (`mcp-server/`, local package until npm publish) | search_models, search_tools, search_repos, get_entity, get_timeline, recent_events |

## Submitting

See [SUBMITTING.md](./SUBMITTING.md). The `/submit` form accepts events, new models, new tools, and new repos; it previews the JSON payload as you type and falls back to a configured GitHub issue link or copyable JSON until the Worker ships.

## Phases

| Phase | Scope | State |
|---|---|---|
| 0 | Repo skeleton, Astro, schemas, CF Pages | ✅ shipped |
| 1 | Seed ~30 frontier models hand-curated | ✅ shipped (44) |
| 2 | Seed ~50 tools hand-curated, cross-ref | ✅ shipped (35) |
| 3 | 12 ingest sources, rolling PR, source verification | ✅ shipped |
| 4 | Worker `/submit` + `/upvote`, watchdog | code-complete, awaiting CF Worker deploy + KV/Turnstile secrets |
| 5 | `/llms.txt`, MCP, bulk dumps, robots.txt | ✅ shipped |
| 6 | Domain + launch | pending domain pick |

## Deploy

CF Pages on the work account. `./deploy.sh` wraps `verify:refs` + `pnpm build` + `wrangler pages deploy`.

## License

Public data. Code MIT; see [LICENSE](./LICENSE). Project-authored structured records and original submission text are dedicated for unrestricted reuse under [LICENSE-DATA](./LICENSE-DATA) to the extent the project can grant those rights; source URLs, provider docs, GitHub metadata, package metadata, and other third-party material remain under their original terms. `robots.txt` explicitly allows the major AI bot fleet.
