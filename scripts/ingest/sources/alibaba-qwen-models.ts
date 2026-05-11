import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://qwenlm.github.io/";
const HOMEPAGE = "https://qwenlm.github.io";
const PRICING_URL = "https://help.aliyun.com/zh/dashscope/developer-reference/api-details";

interface QwenRow {
  apiId: string;
  name: string;
  released: string;
  contextWindow: number;
  outputWindow: number | null;
  modalities: Model["modalities"];
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
}

const KNOWN: QwenRow[] = [
  {
    apiId: "qwen3.5-plus-20260420",
    name: "Qwen3.5 Plus 2026-04-20",
    released: "2026-04-27",
    contextWindow: 1_000_000,
    outputWindow: 65_536,
    modalities: ["text"],
    inputPerMtok: 0.4,
    outputPerMtok: 2.4,
    tags: ["open-weights", "long-context"],
  },
  {
    apiId: "qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    released: "2025-09-23",
    contextWindow: 1_000_000,
    outputWindow: 65_536,
    modalities: ["text"],
    inputPerMtok: 0.65,
    outputPerMtok: 3.25,
    tags: ["open-weights", "code", "long-context"],
  },
  {
    apiId: "qwen3-max",
    name: "Qwen3 Max",
    released: "2025-09-23",
    contextWindow: 262_144,
    outputWindow: 32_768,
    modalities: ["text"],
    inputPerMtok: 0.78,
    outputPerMtok: 3.9,
    tags: ["open-weights", "frontier"],
  },
  {
    apiId: "qwen3-vl-235b-a22b-instruct",
    name: "Qwen3 VL 235B A22B Instruct",
    released: "2025-09-23",
    contextWindow: 262_144,
    outputWindow: 16_384,
    modalities: ["text", "vision"],
    inputPerMtok: 0.20,
    outputPerMtok: 0.88,
    tags: ["open-weights", "multimodal", "moe"],
  },
  {
    apiId: "qwen3-coder",
    name: "Qwen3 Coder 480B A35B",
    released: "2025-07-23",
    contextWindow: 262_144,
    outputWindow: 65_536,
    modalities: ["text"],
    inputPerMtok: 0.22,
    outputPerMtok: 1.80,
    tags: ["open-weights", "code", "moe"],
  },
];

function toModel(row: QwenRow, now: Date): Model {
  return {
    kind: "model",
    id: `alibaba__${row.apiId}`,
    name: row.name,
    provider: "alibaba",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: row.modalities,
    license: "open-weights",
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

export const alibabaQwenModels: Source = {
  id: "alibaba-qwen-models",
  description: "qwenlm.github.io + Aliyun DashScope pricing — authoritative for Qwen3 / 3.5 family.",
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
    return { source: "alibaba-qwen-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
