import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://www.llama.com/";
const HOMEPAGE = "https://www.llama.com";
const ANNOUNCE_URL = "https://ai.meta.com/blog/llama-4-multimodal-intelligence/";

interface LlamaRow {
  apiId: string;
  name: string;
  released: string;
  contextWindow: number;
  outputWindow: number | null;
  modalities: Model["modalities"];
  // Pricing here reflects a representative public-host market rate, since Meta itself
  // ships open weights rather than a first-party hosted API. Keep these stable; OR
  // (supplementary) gap-fills if drift appears.
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
  sourcesExtra?: string[];
}

const KNOWN: LlamaRow[] = [
  {
    apiId: "llama-4-maverick",
    name: "Llama 4 Maverick",
    released: "2025-04-05",
    contextWindow: 10_000_000,
    outputWindow: 16_384,
    modalities: ["text", "vision"],
    inputPerMtok: 0.15,
    outputPerMtok: 0.6,
    tags: ["open-weights", "multimodal", "very-long-context"],
    sourcesExtra: [ANNOUNCE_URL],
  },
  {
    apiId: "llama-4-scout",
    name: "Llama 4 Scout",
    released: "2025-04-05",
    contextWindow: 10_000_000,
    outputWindow: 16_384,
    modalities: ["text", "vision"],
    inputPerMtok: 0.08,
    outputPerMtok: 0.3,
    tags: ["open-weights", "multimodal", "very-long-context"],
    sourcesExtra: [ANNOUNCE_URL],
  },
  {
    apiId: "llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    released: "2024-12-06",
    contextWindow: 131_072,
    outputWindow: 16_384,
    modalities: ["text"],
    inputPerMtok: 0.10,
    outputPerMtok: 0.32,
    tags: ["open-weights", "instruct"],
  },
  {
    apiId: "llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision Instruct",
    released: "2024-09-25",
    contextWindow: 131_072,
    outputWindow: 16_384,
    modalities: ["text", "vision"],
    inputPerMtok: 0.245,
    outputPerMtok: 0.245,
    tags: ["open-weights", "multimodal", "small"],
  },
];

function toModel(row: LlamaRow, now: Date): Model {
  return {
    kind: "model",
    id: `meta__${row.apiId}`,
    name: row.name,
    provider: "meta",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: row.modalities,
    license: "llama-community",
    pricing: {
      input_per_mtok: row.inputPerMtok,
      output_per_mtok: row.outputPerMtok,
      as_of: now.toISOString().slice(0, 10),
    },
    links: { homepage: HOMEPAGE, docs: DOCS_URL },
    tags: row.tags,
    sources: [DOCS_URL, ...(row.sourcesExtra ?? [])],
    status: "ga",
  };
}

export const metaLlamaModels: Source = {
  id: "meta-llama-models",
  description: "llama.com — authoritative names + context for Llama 3.2 / 3.3 / 4 family.",
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
    return { source: "meta-llama-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
