import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const DOCS_URL = "https://platform.openai.com/docs/models";
const HOMEPAGE = "https://openai.com";

interface OpenAiRow {
  apiId: string;
  name: string;
  released: string | null;
  contextWindow: number;
  outputWindow: number | null;
  modalities: Model["modalities"];
  inputPerMtok: number;
  outputPerMtok: number;
  tags: string[];
  status: Model["status"];
}

// Pricing as published on platform.openai.com/docs/models. All proprietary
// (no open-weights GPT models). Context windows reflect the public-API
// limits, not the marketing-deck headline numbers.
const KNOWN: OpenAiRow[] = [
  {
    apiId: "gpt-5.5-pro",
    name: "GPT-5.5 Pro",
    released: "2026-04-24",
    contextWindow: 1_050_000,
    outputWindow: 128_000,
    modalities: ["text", "vision"],
    inputPerMtok: 30,
    outputPerMtok: 180,
    tags: ["frontier", "reasoning", "long-context"],
    status: "ga",
  },
  {
    apiId: "gpt-5.5",
    name: "GPT-5.5",
    released: "2026-04-24",
    contextWindow: 1_050_000,
    outputWindow: 128_000,
    modalities: ["text", "vision"],
    inputPerMtok: 5,
    outputPerMtok: 30,
    tags: ["frontier", "long-context"],
    status: "ga",
  },
  {
    apiId: "gpt-5.4",
    name: "GPT-5.4",
    released: "2026-03-05",
    contextWindow: 1_050_000,
    outputWindow: 128_000,
    modalities: ["text", "vision"],
    inputPerMtok: 2.5,
    outputPerMtok: 15,
    tags: ["balanced", "long-context"],
    status: "ga",
  },
  {
    apiId: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    released: "2026-03-17",
    contextWindow: 400_000,
    outputWindow: 128_000,
    modalities: ["text", "vision"],
    inputPerMtok: 0.75,
    outputPerMtok: 4.5,
    tags: ["small", "fast"],
    status: "ga",
  },
  {
    apiId: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    released: "2026-03-17",
    contextWindow: 400_000,
    outputWindow: 128_000,
    modalities: ["text", "vision"],
    inputPerMtok: 0.2,
    outputPerMtok: 1.25,
    tags: ["nano", "cheapest-tier"],
    status: "ga",
  },
  {
    apiId: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    released: "2026-02-24",
    contextWindow: 400_000,
    outputWindow: 128_000,
    modalities: ["text", "code"],
    inputPerMtok: 1.75,
    outputPerMtok: 14,
    tags: ["coding", "agentic"],
    status: "ga",
  },
];

function toModel(row: OpenAiRow, now: Date): Model {
  return {
    kind: "model",
    id: `openai__${row.apiId}`,
    name: row.name,
    provider: "openai",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: row.modalities,
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

export const openaiModels: Source = {
  id: "openai-models",
  description: "platform.openai.com/docs/models — authoritative pricing + context for GPT-5.x family.",
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
    return { source: "openai-models", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
