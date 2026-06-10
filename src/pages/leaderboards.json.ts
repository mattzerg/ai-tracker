import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadRepos, loadTools } from "../lib/data.ts";
import { qualityForModel, qualityForRepo } from "../lib/quality.ts";

// Machine-readable leaderboards. Mirrors /leaderboards/<slug> HTML pages.

interface LeanRow {
  rank: number;
  id?: string;
  name: string;
  provider?: string;
  value: number | string;
  href: string;
}

interface LeanBoard {
  slug: string;
  title: string;
  metric: string;
  rows: LeanRow[];
}

export const GET: APIRoute = () => {
  const models = loadModels();
  const tools = loadTools();
  const repos = loadRepos();
  const events = loadEvents();
  const now = new Date();

  const cheapestInput = models
    .filter((m) => m.pricing?.input_per_mtok != null)
    .sort((a, b) => a.pricing!.input_per_mtok! - b.pricing!.input_per_mtok!)
    .slice(0, 25)
    .map((m, i) => ({
      rank: i + 1,
      id: m.id,
      name: m.name,
      provider: m.provider,
      value: m.pricing!.input_per_mtok!,
      href: `/models/${m.id}`,
    }));

  const longestContext = models
    .filter((m) => m.context_window != null)
    .sort((a, b) => b.context_window! - a.context_window!)
    .slice(0, 25)
    .map((m, i) => ({
      rank: i + 1,
      id: m.id,
      name: m.name,
      provider: m.provider,
      value: m.context_window!,
      href: `/models/${m.id}`,
    }));

  const usageCount = new Map<string, number>();
  for (const t of tools) for (const id of t.built_on_models) usageCount.set(id, (usageCount.get(id) ?? 0) + 1);
  const mostUsed = Array.from(usageCount.entries())
    .map(([id, count]) => ({ model: models.find((m) => m.id === id), count }))
    .filter((x): x is { model: NonNullable<typeof x.model>; count: number } => Boolean(x.model))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)
    .map(({ model, count }, i) => ({
      rank: i + 1,
      id: model.id,
      name: model.name,
      provider: model.provider,
      value: count,
      href: `/models/${model.id}`,
    }));

  const mostActiveRepos = repos
    .filter((r) => r.pushed_at && r.stars != null)
    .map((r) => {
      const ageDays = Math.max(1, Math.floor((Date.now() - new Date(`${r.pushed_at}T00:00:00Z`).getTime()) / 86400000));
      return { r, score: (r.stars ?? 0) / Math.log10(ageDays + 9) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map(({ r, score }, i) => ({
      rank: i + 1,
      id: r.id,
      name: r.full_name,
      provider: r.owner,
      value: Math.round(score),
      href: `/repos/${r.id}`,
    }));

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const providerCounts = new Map<string, number>();
  function providerOf(entityId: string): string {
    const m = models.find((x) => x.id === entityId);
    if (m) return m.provider;
    const t = tools.find((x) => x.id === entityId);
    if (t) return t.vendor;
    const r = repos.find((x) => x.id === entityId);
    if (r) return r.owner;
    return "—";
  }
  for (const e of events) {
    if (e.date < ninetyDaysAgo) continue;
    const p = providerOf(e.entity);
    providerCounts.set(p, (providerCounts.get(p) ?? 0) + 1);
  }
  const mostShipping = Array.from(providerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([provider, count], i) => ({
      rank: i + 1,
      name: provider,
      value: count,
      href: `/providers/${encodeURIComponent(provider)}`,
    }));

  // Benchmark boards: top models by a given benchmark key. Fractions are stored
  // 0-1 (rendered as %); arena_elo is an integer. Only models carrying the key
  // appear, ranked desc.
  function benchBoard(slug: string, title: string, key: string, metric: string): LeanBoard {
    const rows = models
      .filter((m) => m.benchmarks?.[key] != null)
      .sort((a, b) => (b.benchmarks![key] as number) - (a.benchmarks![key] as number))
      .slice(0, 25)
      .map((m, i) => ({
        rank: i + 1,
        id: m.id,
        name: m.name,
        provider: m.provider,
        value: m.benchmarks![key]!,
        href: `/models/${m.id}`,
      }));
    return { slug, title, metric, rows };
  }

  const boards: LeanBoard[] = [
    { slug: "cheapest-input", title: "Cheapest input pricing", metric: "usd_per_mtok_input", rows: cheapestInput },
    { slug: "longest-context", title: "Longest context window", metric: "tokens", rows: longestContext },
    { slug: "most-used-by-tools", title: "Most-used models", metric: "tool_count", rows: mostUsed },
    { slug: "most-active-repos", title: "Most-active repos", metric: "activity_score", rows: mostActiveRepos },
    { slug: "most-shipping-providers", title: "Most-shipping providers", metric: "events_last_90d", rows: mostShipping },
    benchBoard("top-swe-bench", "Top coding (SWE-bench Verified)", "swe_bench_verified", "fraction"),
    benchBoard("top-gpqa", "Top reasoning (GPQA Diamond)", "gpqa_diamond", "fraction"),
    benchBoard("top-arena-elo", "Top by Arena Elo", "arena_elo", "elo"),
    benchBoard("top-quality-index", "Top by quality index", "quality_index", "fraction"),
    // Composite quality/notability (benchmarks/popularity + signal + recency).
    {
      slug: "top-quality-models",
      title: "Highest-quality models",
      metric: "quality_score",
      rows: models
        .map((m) => ({ m, q: qualityForModel(m, now) }))
        .sort((a, b) => b.q.score - a.q.score)
        .slice(0, 25)
        .map(({ m, q }, i) => ({ rank: i + 1, id: m.id, name: m.name, provider: m.provider, value: q.score, href: `/models/${m.id}` })),
    },
    {
      slug: "top-quality-repos",
      title: "Highest-quality repos",
      metric: "quality_score",
      rows: repos
        .map((r) => ({ r, q: qualityForRepo(r, now) }))
        .sort((a, b) => b.q.score - a.q.score)
        .slice(0, 25)
        .map(({ r, q }, i) => ({ rank: i + 1, id: r.id, name: r.full_name, provider: r.owner, value: q.score, href: `/repos/${r.id}` })),
    },
  ].filter((b) => b.rows.length > 0);

  const body = JSON.stringify({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    boards,
  });
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
};
