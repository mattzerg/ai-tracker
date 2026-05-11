import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://api-docs.deepseek.com/quick_start/pricing";
const HOMEPAGE = "https://deepseek.com";

interface DeepSeekRow {
  apiId: string;
  name: string;
  released: string | null;
  contextWindow: number;
  outputWindow: number | null;
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
  status: Model["status"];
}

// Pricing as published on api-docs.deepseek.com/quick_start/pricing.
// All proprietary API endpoints; weight releases tracked separately.
const KNOWN: DeepSeekRow[] = [
  {
    apiId: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    released: "2026-04-24",
    contextWindow: 1_048_576,
    outputWindow: 384_000,
    inputPerMtok: 0.435,
    outputPerMtok: 0.87,
    tags: ["reasoning", "thinking", "long-context", "discounted"],
    status: "ga",
  },
  {
    apiId: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    released: "2026-04-24",
    contextWindow: 1_048_576,
    outputWindow: 384_000,
    inputPerMtok: 0.14,
    outputPerMtok: 0.28,
    tags: ["fast", "cheap", "long-context"],
    status: "ga",
  },
  {
    apiId: "deepseek-v3.2-exp",
    name: "DeepSeek V3.2 Exp",
    released: "2025-09-29",
    contextWindow: 163_840,
    outputWindow: 65_536,
    inputPerMtok: 0.27,
    outputPerMtok: 0.41,
    tags: ["experimental", "long-context"],
    status: "ga",
  },
  {
    apiId: "deepseek-r1-0528",
    name: "DeepSeek R1 0528",
    released: "2025-05-28",
    contextWindow: 163_840,
    outputWindow: 32_768,
    inputPerMtok: 0.5,
    outputPerMtok: 2.15,
    tags: ["reasoning"],
    status: "ga",
  },
  {
    apiId: "deepseek-r1",
    name: "DeepSeek R1",
    released: "2025-01-20",
    contextWindow: 64_000,
    outputWindow: 16_000,
    inputPerMtok: 0.7,
    outputPerMtok: 2.5,
    tags: ["reasoning"],
    status: "ga",
  },
];

function toModel(row: DeepSeekRow, now: Date): Model {
  return {
    kind: "model",
    id: `deepseek__${row.apiId}`,
    name: row.name,
    provider: "deepseek",
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
    sources: [DOCS_URL],
    status: row.status,
  };
}

export const deepseekModels: Source = {
  id: "deepseek-models",
  description: "DeepSeek api-docs pricing — authoritative pricing + context for V3/V4/R1 family.",
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
    return { source: "deepseek-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
