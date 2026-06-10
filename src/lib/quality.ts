import type { Model, Repo, Tool } from "../../schemas/index.ts";

// Composite quality/notability score (0-100) per entity. Transparent and
// component-weighted: blends the proprietary signal layer (who's talking about
// it), benchmark strength (models), popularity + activity (repos), and recency.
//
// Derived at render time — NOT stored in data/. Components that are missing for
// an entity are dropped and the remaining weights renormalized, so e.g. a model
// without benchmarks is scored on signal + freshness rather than penalized to 0.

export interface QualityComponent {
  key: string;
  value: number; // 0-100
  weight: number;
}
export interface QualityResult {
  score: number; // 0-100
  components: QualityComponent[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Log-scaled star popularity: ~1k stars ≈ 50, ~300k ≈ 100.
function starScore(stars: number | null | undefined): number {
  if (!stars || stars <= 0) return 0;
  return clamp((Math.log10(stars + 1) / Math.log10(300_000)) * 100);
}

// Recency with a half-life: today ≈ 100, one half-life ago ≈ 50.
function recencyScore(dateStr: string | null | undefined, now: Date, halfLifeDays = 365): number {
  if (!dateStr) return 0;
  const t = Date.parse(dateStr.length === 7 ? `${dateStr}-01` : dateStr);
  if (Number.isNaN(t)) return 0;
  const ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  return clamp(100 * Math.pow(0.5, ageDays / halfLifeDays));
}

// Benchmark strength: prefer the composite quality_index (0-1) if present,
// else average the normalized academic/coding benchmarks. Returns null if none.
const BENCH_KEYS = ["mmlu", "mmlu_pro", "gpqa_diamond", "swe_bench_verified", "swe_bench_pro", "humaneval", "math", "terminal_bench"];
function benchScore(m: Model): number | null {
  const b = m.benchmarks ?? {};
  if (typeof b.quality_index === "number") return clamp(b.quality_index * 100);
  const vals = BENCH_KEYS.map((k) => b[k]).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return clamp((vals.reduce((a, c) => a + c, 0) / vals.length) * 100);
}

function signalScore(e: { signals?: { signal_score: number } }): number {
  return clamp(e.signals?.signal_score ?? 0);
}

// Combine available components into a renormalized weighted score.
function combine(components: (QualityComponent | null)[]): QualityResult {
  const present = components.filter((c): c is QualityComponent => c != null && Number.isFinite(c.value));
  const totalW = present.reduce((a, c) => a + c.weight, 0);
  if (totalW === 0) return { score: 0, components: [] };
  const score = present.reduce((a, c) => a + c.value * c.weight, 0) / totalW;
  return { score: Math.round(score), components: present };
}

export function qualityForModel(m: Model, now: Date): QualityResult {
  const bench = benchScore(m);
  return combine([
    bench != null ? { key: "benchmarks", value: bench, weight: 50 } : null,
    { key: "signal", value: signalScore(m), weight: 30 },
    { key: "freshness", value: recencyScore(m.released, now, 365), weight: 20 },
  ]);
}

export function qualityForRepo(r: Repo, now: Date): QualityResult {
  return combine([
    { key: "popularity", value: starScore(r.stars), weight: 45 },
    { key: "activity", value: recencyScore(r.pushed_at, now, 180), weight: 30 },
    { key: "signal", value: signalScore(r), weight: 25 },
  ]);
}

export function qualityForTool(t: Tool, now: Date): QualityResult {
  return combine([
    { key: "signal", value: signalScore(t), weight: 45 },
    { key: "freshness", value: recencyScore(t.released, now, 365), weight: 30 },
    { key: "adoption", value: clamp((t.built_on_models?.length ?? 0) * 20), weight: 25 },
  ]);
}
