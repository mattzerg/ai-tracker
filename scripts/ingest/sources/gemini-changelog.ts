import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

const CHANGELOG_URL = "https://ai.google.dev/gemini-api/docs/changelog";
const PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
const MODELS_URL = "https://ai.google.dev/gemini-api/docs/models";

interface GeminiRow {
  apiId: string;
  name: string;
  contextWindow: number;
  outputWindow: number;
  inputPerMtok: number;
  outputPerMtok: number;
  modalities: ("text" | "vision" | "audio" | "video" | "image-gen" | "embedding" | "code")[];
  released: string | null;
  status: "ga" | "preview" | "deprecated";
  tags?: string[];
}

const KNOWN: GeminiRow[] = [
  { apiId: "gemini-3.5-flash",       name: "Gemini 3.5 Flash",       contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 1.50, outputPerMtok: 9.00,  modalities: ["text", "vision", "audio", "video"], released: "2026-05-19", status: "ga",      tags: ["fast", "balanced", "long-context", "multimodal"] },
  { apiId: "gemini-3.1-pro",         name: "Gemini 3.1 Pro",         contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 2.00, outputPerMtok: 12.00, modalities: ["text", "vision", "audio", "video"], released: null,         status: "preview", tags: ["frontier", "long-context", "multimodal"] },
  { apiId: "gemini-3.1-flash-lite",  name: "Gemini 3.1 Flash-Lite",  contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 0.25, outputPerMtok: 1.50,  modalities: ["text", "vision", "audio", "video"], released: null,         status: "ga",      tags: ["fast", "cheap", "long-context"] },
  { apiId: "gemini-2.5-pro",         name: "Gemini 2.5 Pro",         contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 1.25, outputPerMtok: 10.00, modalities: ["text", "vision", "audio", "video"], released: "2025-06-17", status: "deprecated",      tags: ["balanced", "long-context", "multimodal"] },
  { apiId: "gemini-2.5-flash",       name: "Gemini 2.5 Flash",       contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 0.30, outputPerMtok: 2.50,  modalities: ["text", "vision", "video"],          released: "2025-06-17", status: "deprecated",      tags: ["fast", "high-volume", "long-context"] },
  { apiId: "gemini-2.5-flash-lite",  name: "Gemini 2.5 Flash-Lite",  contextWindow: 1_048_576, outputWindow: 65_536, inputPerMtok: 0.10, outputPerMtok: 0.40,  modalities: ["text", "vision", "video"],          released: "2025-06-17", status: "deprecated",      tags: ["cheapest-tier", "fast", "long-context"] },
];

function toModel(row: GeminiRow, now: Date): Model {
  return {
    kind: "model",
    id: `google__${row.apiId}`,
    name: row.name,
    provider: "google",
    released: row.released,
    context_window: row.contextWindow,
    output_window: row.outputWindow,
    modalities: row.modalities,
    license: "proprietary",
    pricing: { input_per_mtok: row.inputPerMtok, output_per_mtok: row.outputPerMtok, as_of: now.toISOString().slice(0, 10) },
    links: { homepage: "https://deepmind.google/technologies/gemini/", docs: MODELS_URL },
    tags: row.tags ?? [],
    sources: [PRICING_URL, MODELS_URL, CHANGELOG_URL],
    status: row.status,
  };
}

export const geminiChangelog: Source = {
  id: "gemini-changelog",
  description: "ai.google.dev Gemini API changelog + pricing — authoritative GA models.",
  trust: "authoritative",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    for (const url of [CHANGELOG_URL, PRICING_URL, MODELS_URL]) {
      try {
        const res = await fetch(url, { method: "HEAD", headers: { "user-agent": "ai-tracker-ingest/0.1" } });
        if (!res.ok && res.status !== 403) warnings.push(`reachability HEAD ${res.status}: ${url}`);
      } catch (err) {
        warnings.push(`reachability fetch failed for ${url}: ${(err as Error).message}`);
      }
    }
    return { source: "gemini-changelog", models: KNOWN.map((r) => toModel(r, ctx.now)), warnings, estimatedCostUsd: 0 };
  },
};
