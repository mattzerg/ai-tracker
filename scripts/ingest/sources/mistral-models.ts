import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://docs.mistral.ai/getting-started/models/models_overview/";
const HOMEPAGE = "https://mistral.ai";

interface MistralRow {
  apiId: string;
  name: string;
  released: string | null;
  contextWindow: number;
  modalities: Model["modalities"];
  license: Model["license"];
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
  status: Model["status"];
}

// Pricing as published on docs.mistral.ai/getting-started/models. License reflects
// Mistral's published distribution: "proprietary" for La Plateforme-only models,
// "open-weights" (Apache 2.0) for those with HF weights.
const KNOWN: MistralRow[] = [
  {
    apiId: "mistral-large-2512",
    name: "Mistral Large 3 2512",
    released: "2025-12-01",
    contextWindow: 262_144,
    modalities: ["text"],
    license: "proprietary",
    inputPerMtok: 0.5,
    outputPerMtok: 1.5,
    tags: ["frontier", "long-context"],
    status: "ga",
  },
  {
    apiId: "mistral-medium-3.1",
    name: "Mistral Medium 3.1",
    released: "2025-08-13",
    contextWindow: 131_072,
    modalities: ["text"],
    license: "proprietary",
    inputPerMtok: 0.4,
    outputPerMtok: 2.0,
    tags: ["mid-tier"],
    status: "ga",
  },
  {
    apiId: "codestral-2508",
    name: "Codestral 2508",
    released: "2025-08-01",
    contextWindow: 256_000,
    modalities: ["text"],
    license: "open-weights",
    inputPerMtok: 0.3,
    outputPerMtok: 0.9,
    tags: ["code", "open-weights"],
    status: "ga",
  },
  {
    apiId: "devstral-2512",
    name: "Devstral 2 2512",
    released: "2025-12-09",
    contextWindow: 262_144,
    modalities: ["text"],
    license: "open-weights",
    inputPerMtok: 0.4,
    outputPerMtok: 2.0,
    tags: ["agent", "open-weights"],
    status: "ga",
  },
  {
    apiId: "pixtral-large-2411",
    name: "Pixtral Large 2411",
    released: "2024-11-19",
    contextWindow: 131_072,
    modalities: ["text", "vision"],
    license: "open-weights",
    inputPerMtok: 2.0,
    outputPerMtok: 6.0,
    tags: ["multimodal", "open-weights"],
    status: "ga",
  },
];

function toModel(row: MistralRow, now: Date): Model {
  return {
    kind: "model",
    id: `mistral__${row.apiId}`,
    name: row.name,
    provider: "mistral",
    released: row.released,
    context_window: row.contextWindow,
    output_window: null,
    modalities: row.modalities,
    license: row.license,
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

export const mistralModels: Source = {
  id: "mistral-models",
  description: "Mistral docs models overview — authoritative pricing + context for La Plateforme + open-weights releases.",
  trust: "authoritative",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    try {
      const res = await fetch(DOCS_URL, { method: "HEAD", headers: { "user-agent": "ai-tracker-ingest/0.1" } });
      if (!res.ok && res.status !== 403 && res.status !== 405) {
        warnings.push(`reachability HEAD ${res.status} — KNOWN map may be stale`);
      }
    } catch (err) {
      warnings.push(`reachability fetch failed: ${(err as Error).message}`);
    }
    return { source: "mistral-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
