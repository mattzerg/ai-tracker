import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://docs.cohere.com/docs/models";
const HOMEPAGE = "https://cohere.com";
const PRICING_URL = "https://cohere.com/pricing";

interface CohereRow {
  apiId: string;
  name: string;
  released: string;
  contextWindow: number;
  outputWindow: number | null;
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
}

const KNOWN: CohereRow[] = [
  {
    apiId: "command-a",
    name: "Command A",
    released: "2025-03-13",
    contextWindow: 256_000,
    outputWindow: 8_192,
    inputPerMtok: 2.5,
    outputPerMtok: 10,
    tags: ["enterprise", "long-context"],
  },
  {
    apiId: "command-r-plus-08-2024",
    name: "Command R+ (08-2024)",
    released: "2024-08-30",
    contextWindow: 128_000,
    outputWindow: 4_000,
    inputPerMtok: 2.5,
    outputPerMtok: 10,
    tags: ["rag", "tools"],
  },
];

function toModel(row: CohereRow, now: Date): Model {
  return {
    kind: "model",
    id: `cohere__${row.apiId}`,
    name: row.name,
    provider: "cohere",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: ["text"],
    license: "proprietary",
    pricing: {
      input_per_mtok: row.inputPerMtok,
      output_per_mtok: row.outputPerMtok,
      as_of: now.toISOString().slice(0, 10),
    },
    links: { homepage: HOMEPAGE, docs: DOCS_URL },
    tags: row.tags,
    sources: [DOCS_URL, PRICING_URL],
    status: "ga",
  };
}

export const cohereModels: Source = {
  id: "cohere-models",
  description: "docs.cohere.com — authoritative pricing + context for Command family.",
  trust: "authoritative",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    try {
      const res = await fetch(DOCS_URL, { method: "HEAD", headers: { "user-agent": "ai-tracker-ingest/0.1" } });
      if (!res.ok && res.status !== 401 && res.status !== 403 && res.status !== 405) {
        warnings.push(`reachability HEAD ${res.status} — KNOWN map may be stale`);
      }
    } catch (err) {
      warnings.push(`reachability fetch failed: ${(err as Error).message}`);
    }
    return { source: "cohere-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
