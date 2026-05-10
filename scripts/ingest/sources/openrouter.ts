import type { Model } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number; max_completion_tokens?: number };
}

const ENDPOINT = "https://openrouter.ai/api/v1/models";

const PROVIDER_PREFIX_TO_PROVIDER: Record<string, string> = {
  "openai": "openai",
  "anthropic": "anthropic",
  "google": "google",
  "x-ai": "xai",
  "deepseek": "deepseek",
  "meta-llama": "meta",
  "mistralai": "mistral",
  "qwen": "alibaba",
  "cohere": "cohere",
};

function toLicenseFromProvider(provider: string): Model["license"] {
  if (provider === "meta") return "llama-community";
  if (["openai", "anthropic", "google", "xai", "deepseek", "cohere"].includes(provider)) return "proprietary";
  return "open-weights";
}

function toEntityId(orId: string): { provider: string; id: string } | null {
  const [prefix, rest] = orId.split("/");
  const provider = PROVIDER_PREFIX_TO_PROVIDER[prefix];
  if (!provider || !rest) return null;
  const cleanRest = rest.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
  return { provider, id: `${provider}__${cleanRest}` };
}

function toModel(or: OpenRouterModel, now: Date): Model | null {
  const ent = toEntityId(or.id);
  if (!ent) return null;
  const released = or.created ? new Date(or.created * 1000).toISOString().slice(0, 10) : null;
  const ctx = or.context_length ?? or.top_provider?.context_length ?? null;
  const out = or.top_provider?.max_completion_tokens ?? null;
  const inP = or.pricing?.prompt ? Number(or.pricing.prompt) * 1_000_000 : null;
  const outP = or.pricing?.completion ? Number(or.pricing.completion) * 1_000_000 : null;
  return {
    kind: "model",
    id: ent.id,
    name: or.name,
    provider: ent.provider,
    released,
    context_window: ctx && ctx > 0 ? ctx : null,
    output_window: out && out > 0 ? out : null,
    modalities: ["text"],
    license: toLicenseFromProvider(ent.provider),
    pricing:
      inP != null && outP != null
        ? { input_per_mtok: inP, output_per_mtok: outP, as_of: now.toISOString().slice(0, 10) }
        : null,
    links: {},
    tags: [],
    sources: [ENDPOINT],
    status: "ga",
  };
}

export const openrouter: Source = {
  id: "openrouter",
  description: "OpenRouter /api/v1/models — aggregator catalog covering most frontier providers.",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    let raw: { data: OpenRouterModel[] } | undefined;
    try {
      const res = await fetch(ENDPOINT, { headers: { "user-agent": "ai-tracker-ingest/0.1" } });
      if (!res.ok) {
        warnings.push(`HTTP ${res.status}`);
        return { source: "openrouter", warnings, estimatedCostUsd: 0 };
      }
      raw = (await res.json()) as { data: OpenRouterModel[] };
    } catch (err) {
      warnings.push(`fetch failed: ${(err as Error).message}`);
      return { source: "openrouter", warnings, estimatedCostUsd: 0 };
    }
    const models: Model[] = [];
    for (const or of raw.data) {
      const m = toModel(or, ctx.now);
      if (m) models.push(m);
    }
    return { source: "openrouter", models, warnings, estimatedCostUsd: 0 };
  },
};
