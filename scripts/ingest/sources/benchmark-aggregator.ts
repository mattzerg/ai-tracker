import type { Model } from "../../../schemas/index.ts";
import { loadModels } from "../../../src/lib/data.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

// Benchmark aggregator — fills the model `benchmarks` field from public
// leaderboards. Supplementary trust: it only fills benchmark keys a model lacks
// (provider-curated scores win; see mergeBenchmarks in merge.ts).
//
// Primary source: swfte.com AI leaderboard (a Next.js app embedding all model
// rows + structured benchmarks in __NEXT_DATA__). The tracker already cites
// swfte for arena_elo, so this systematizes what was hand-curated. NO fabricated
// fallback — if the fetch/parse fails, the source returns warnings and adds
// nothing (benchmarks must be real or absent).

const SWFTE_URL = "https://www.swfte.com/ai/leaderboard";

interface SwfteModel {
  slug: string;
  name: string;
  provider: string;
  modelId: string; // e.g. "anthropic/claude-opus-4.8"
  benchmarks?: Record<string, number>;
}

// swfte benchmark key → tracker key + normalizer. swfte reports percentages
// (0-100) for academic evals and an integer arena Elo. The tracker convention
// (verify-quality.ts) is 0-1 fractions for everything except arena_elo. Speed
// metrics (tokensPerSecond, ttftMs) are perf, not evals — intentionally skipped.
const BENCH_MAP: Record<string, { key: string; transform: (n: number) => number }> = {
  mmlu: { key: "mmlu", transform: (n) => round3(n / 100) },
  humanEval: { key: "humaneval", transform: (n) => round3(n / 100) },
  math: { key: "math", transform: (n) => round3(n / 100) },
  arenaElo: { key: "arena_elo", transform: (n) => Math.round(n) },
  qualityIndex: { key: "quality_index", transform: (n) => round3(n / 100) },
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Canonical key for matching swfte modelId ↔ tracker model id. Strips the
// provider prefix and all non-alphanumerics so "claude-opus-4.8",
// "claude_opus_4_8", and "claude-opus-4-8" all collapse to one key.
function canonKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[a-z]+[/_]+/, "") // drop "anthropic/" or "anthropic__"
    .replace(/[^a-z0-9]/g, "");
}

// A few names that don't survive the canonical collapse get an explicit alias
// (tracker-id-tail → swfte canonical key).
const ALIASES: Record<string, string> = {
  // tracker `google__gemini-3.1-pro` → swfte "gemini-3-1-pro"/"gemini31pro" variants
  "gemini-3.1-pro": "gemini31pro",
};

function parseNextData(html: string): SwfteModel[] {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("__NEXT_DATA__ not found (page structure changed)");
  const data = JSON.parse(m[1]!) as { props?: { pageProps?: { models?: SwfteModel[] } } };
  const models = data.props?.pageProps?.models;
  if (!Array.isArray(models)) throw new Error("pageProps.models missing (payload shape changed)");
  return models;
}

function normalizeBenchmarks(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const map = BENCH_MAP[k];
    if (!map || typeof v !== "number" || !Number.isFinite(v)) continue;
    const val = map.transform(v);
    // Guard the tracker convention: fractions must be 0-1; arena_elo stays int.
    if (map.key !== "arena_elo" && (val < 0 || val > 1)) continue;
    out[map.key] = val;
  }
  return out;
}

export const benchmarkAggregator: Source = {
  id: "benchmark-aggregator",
  description: "swfte.com AI leaderboard — supplementary benchmark scores (mmlu, humaneval, math, arena_elo, quality_index).",
  trust: "supplementary",
  async run(_ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];

    let swfteModels: SwfteModel[];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      const res = await fetch(SWFTE_URL, {
        headers: { "user-agent": "ai-tracker-ingest/0.1 (+https://ai-tracker-dxu.pages.dev)" },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) {
        warnings.push(`swfte HTTP ${res.status} — benchmarks not refreshed this run`);
        return { source: "benchmark-aggregator", warnings, estimatedCostUsd: 0 };
      }
      swfteModels = parseNextData(await res.text());
    } catch (err) {
      warnings.push(`swfte fetch/parse failed: ${(err as Error).message} — benchmarks not refreshed`);
      return { source: "benchmark-aggregator", warnings, estimatedCostUsd: 0 };
    }

    // Index swfte rows by canonical key.
    const swfteByCanon = new Map<string, SwfteModel>();
    for (const sm of swfteModels) {
      const slug = sm.modelId.includes("/") ? sm.modelId.split("/").pop()! : sm.slug;
      swfteByCanon.set(canonKey(slug), sm);
    }

    const models: Model[] = [];
    let matched = 0;
    for (const tracker of loadModels()) {
      const tail = tracker.id.includes("__") ? tracker.id.split("__").pop()! : tracker.id;
      const key = ALIASES[tail] ?? canonKey(tail);
      const sm = swfteByCanon.get(key);
      if (!sm) {
        warnings.push(`no swfte match for ${tracker.id}`);
        continue;
      }
      const bench = normalizeBenchmarks(sm.benchmarks);
      if (!Object.keys(bench).length) continue;
      matched++;
      // Return a shell carrying only id + benchmarks; mergeBenchmarks fills gaps.
      models.push({ ...tracker, benchmarks: bench, sources: [...tracker.sources, SWFTE_URL] });
    }

    warnings.unshift(`matched ${matched}/${loadModels().length} models to swfte benchmarks`);
    return { source: "benchmark-aggregator", models, warnings, estimatedCostUsd: 0 };
  },
};
