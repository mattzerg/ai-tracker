import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const CHANGELOG_URL = "https://platform.claude.com/docs/en/docs/about-claude/models/overview";

// Hand-curated extraction map. The page is a Markdown comparison table; we extract canonical
// rows for each currently-GA model. Adding a new model to the page = adding an entry below.
// Conservative: only emit fields we can read directly from the table's "Latest models" section.
interface AnthropicRow {
  apiId: string;          // "claude-opus-4-7"
  name: string;           // "Claude Opus 4.7"
  contextWindow: number;
  outputWindow: number;
  inputPerMtok: number;
  outputPerMtok: number;
  released: string | null;
}

const KNOWN: AnthropicRow[] = [
  { apiId: "claude-opus-4-8",   name: "Claude Opus 4.8",   contextWindow: 1_000_000, outputWindow: 128_000, inputPerMtok: 5, outputPerMtok: 25, released: "2026-05-28" },
  { apiId: "claude-opus-4-7",   name: "Claude Opus 4.7",   contextWindow: 1_000_000, outputWindow: 128_000, inputPerMtok: 5, outputPerMtok: 25, released: "2026-04-16" },
  { apiId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 1_000_000, outputWindow: 64_000,  inputPerMtok: 3, outputPerMtok: 15, released: "2026-02-17" },
  { apiId: "claude-haiku-4-5",  name: "Claude Haiku 4.5",  contextWindow: 200_000,   outputWindow: 64_000,  inputPerMtok: 1, outputPerMtok: 5,  released: "2025-10-15" },
];

function toModel(row: AnthropicRow, now: Date): Model {
  return {
    kind: "model",
    id: `anthropic__${row.apiId}`,
    name: row.name,
    provider: "anthropic",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: ["text", "vision"],
    license: "proprietary",
    pricing: { input_per_mtok: row.inputPerMtok, output_per_mtok: row.outputPerMtok, as_of: now.toISOString().slice(0, 10) },
    links: { homepage: "https://www.anthropic.com/claude", docs: CHANGELOG_URL },
    tags: [],
    sources: [CHANGELOG_URL],
    status: "ga",
  };
}

export const anthropicChangelog: Source = {
  id: "anthropic-changelog",
  description: "Anthropic platform.claude.com models overview — authoritative pricing, context, output window.",
  trust: "authoritative",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    // Reachability gate: we don't try to parse the markdown live (page is JS-rendered docs),
    // we use the curated KNOWN map and confirm the canonical URL still 200s. If the gate
    // fails, we still emit but flag warnings so the PR catches it.
    try {
      const res = await fetch(CHANGELOG_URL, {
        method: "HEAD",
        headers: { "user-agent": "ai-tracker-ingest/0.1" },
      });
      if (!res.ok) warnings.push(`reachability HEAD ${res.status} — KNOWN map may be stale`);
    } catch (err) {
      warnings.push(`reachability fetch failed: ${(err as Error).message}`);
    }
    const models = KNOWN.map((r) => toModel(r, ctx.now));
    return { source: "anthropic-changelog", models, warnings, estimatedCostUsd: 0 };
  },
};
