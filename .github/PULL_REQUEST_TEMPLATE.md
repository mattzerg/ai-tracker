## What's changing

<!-- One paragraph. What and why. -->

## Surface

<!-- Tick one or more. -->

- [ ] New ingest source (`scripts/ingest/sources/<slug>.ts`)
- [ ] Schema change (`schemas/`)
- [ ] New page / route (`src/pages/`)
- [ ] MCP server (`mcp-server/`)
- [ ] Worker / `/submit` flow (`worker/`)
- [ ] Curated data (`data/models/`, `data/tools/`, `data/repos/`, `data/events/`)
- [ ] Tooling / scripts / CI / docs

## Verified

- [ ] `pnpm typecheck` 0/0/0
- [ ] `pnpm test` green
- [ ] `pnpm verify:refs` green
- [ ] `pnpm build` green
- [ ] (data-touching PRs) `pnpm verify:sources` reachable

## Sources / linked issues

<!-- For data PRs, paste the authoritative source URL(s). For schema/code PRs,
link any related issue or discussion. -->
