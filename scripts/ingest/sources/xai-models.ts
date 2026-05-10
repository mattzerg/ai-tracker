import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://docs.x.ai/docs/models";

interface XaiRow {
  apiId: string;
  name: string;
  contextWindow: number;
  inputPerMtok: number;
  outputPerMtok: number;
  tags?: string[];
}

const KNOWN: XaiRow[] = [
  { apiId: "grok-4.3",                  name: "Grok 4.3",                  contextWindow: 1_000_000, inputPerMtok: 1.25, outputPerMtok: 2.50, tags: ["frontier", "long-context"] },
  { apiId: "grok-4.20",                 name: "Grok 4.20",                 contextWindow: 2_000_000, inputPerMtok: 1.25, outputPerMtok: 2.50, tags: ["reasoning", "long-context"] },
  { apiId: "grok-4.20-multi-agent",     name: "Grok 4.20 Multi-Agent",     contextWindow: 2_000_000, inputPerMtok: 2.00, outputPerMtok: 6.00, tags: ["multi-agent", "long-context"] },
];

function toModel(row: XaiRow, now: Date): Model {
  return {
    kind: "model",
    id: `xai__${row.apiId}`,
    name: row.name,
    provider: "xai",
    released: null,
    context_window: row.contextWindow,
    output_window: null,
    modalities: ["text"],
    license: "proprietary",
    pricing: { input_per_mtok: row.inputPerMtok, output_per_mtok: row.outputPerMtok, as_of: now.toISOString().slice(0, 10) },
    links: { homepage: "https://x.ai", docs: DOCS_URL },
    tags: row.tags ?? [],
    sources: [DOCS_URL],
    status: "ga",
  };
}

export const xaiModels: Source = {
  id: "xai-models",
  description: "xAI docs.x.ai/docs/models — authoritative pricing + context for Grok models.",
  trust: "authoritative",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    try {
      const res = await fetch(DOCS_URL, { method: "HEAD", headers: { "user-agent": "ai-tracker-ingest/0.1" } });
      if (!res.ok && res.status !== 403) warnings.push(`reachability HEAD ${res.status} — KNOWN map may be stale`);
    } catch (err) {
      warnings.push(`reachability fetch failed: ${(err as Error).message}`);
    }
    return { source: "xai-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
