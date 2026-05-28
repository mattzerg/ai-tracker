import type { APIRoute } from "astro";
import { entityById, eventSlug, loadEvents, loadModels, loadRepoCandidateQueue, loadRepos, loadTools } from "../lib/data.ts";
import { loadQueueStatus } from "../lib/queueStatus.ts";

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const models = loadModels();
  const tools = loadTools();
  const repos = loadRepos();
  const repoCandidateQueue = loadRepoCandidateQueue();
  const events = loadEvents();
  const queue = loadQueueStatus();
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = thirtyDaysAgo();

  // Compute highlights mirroring the homepage so agents see them without
  // having to query /dump/all.json + reduce.
  const cheapestInput = models
    .filter((m) => m.pricing?.input_per_mtok != null)
    .sort((a, b) => a.pricing!.input_per_mtok! - b.pricing!.input_per_mtok!)
    .slice(0, 3);
  const longestContext = models
    .filter((m) => m.context_window != null)
    .sort((a, b) => b.context_window! - a.context_window!)
    .slice(0, 3);
  const usageCount = new Map<string, number>();
  for (const t of tools) for (const id of t.built_on_models) usageCount.set(id, (usageCount.get(id) ?? 0) + 1);
  const mostUsed = Array.from(usageCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ model: models.find((m) => m.id === id), count }))
    .filter((x) => x.model);

  const providerCounts = new Map<string, number>();
  for (const m of models) providerCounts.set(m.provider, (providerCounts.get(m.provider) ?? 0) + 1);
  const providersByCount = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1]);

  const categoryCounts = new Map<string, number>();
  for (const t of tools) categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  const categoriesByCount = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  const repoCategoryCounts = new Map<string, number>();
  for (const r of repos) repoCategoryCounts.set(r.category, (repoCategoryCounts.get(r.category) ?? 0) + 1);
  const repoCategoriesByCount = Array.from(repoCategoryCounts.entries()).sort((a, b) => b[1] - a[1]);

  const recent30 = events.filter((e) => e.date >= cutoff);
  const sortedModels = models.slice().sort((a, b) => (b.released ?? "0").localeCompare(a.released ?? "0"));
  const sortedTools = tools.slice().sort((a, b) => (b.released ?? "0").localeCompare(a.released ?? "0"));
  const sortedRepos = repos.slice().sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.full_name.localeCompare(b.full_name));

  const lines: string[] = [];
  lines.push("# ai-tracker");
  lines.push("");
  lines.push(`Canonical machine-readable timeline of AI models, tools, and developer repos. Updated ${today}.`);
  lines.push("Designed to be consumed by agents. No login, no signup, AI-bot-friendly.");
  lines.push("");
  lines.push(`Stats: ${models.length} models · ${tools.length} tools · ${repos.length} repos · ${repoCandidateQueue.candidates.length} repo candidates · ${events.length} events · ${recent30.length} events in last 30 days.`);
  lines.push("");

  lines.push("## How to query");
  lines.push("");
  lines.push(`- Bulk: ${base}/dump/all.json (every model, tool, repo, event, queue status)`);
  lines.push(`- 30-day events only: ${base}/dump/events-30d.json`);
  lines.push(`- Full corpus as text: ${base}/llms-full.txt`);
  lines.push(`- Per-entity JSON twin: ${base}/models/<id>.json, ${base}/tools/<id>.json, or ${base}/repos/<id>.json`);
  lines.push(`- Per-entity Markdown twin: ${base}/models/<id>.md, ${base}/tools/<id>.md, or ${base}/repos/<id>.md`);
  lines.push(`- Repo candidate review queue: ${base}/repos/candidates.json`);
  lines.push(`- Per-event detail: ${base}/events/<date>__<entity>__<type>`);
  lines.push(`- Human model picker + workload cost calculator: ${base}/picker`);
  lines.push(`- RSS / Atom: ${base}/feed.xml · ${base}/atom.xml`);
  lines.push(`- Agent sitemap: ${base}/sitemap-agents.xml (all machine-consumable URLs)`);
  lines.push(`- MCP server: local package in mcp-server/ until npm publish (tools: search_models, search_tools, search_repos, get_entity, get_timeline, recent_events)`);
  lines.push("");

  lines.push("## Highlights");
  lines.push("");
  lines.push("Cheapest input price ($/Mtok):");
  for (const m of cheapestInput) lines.push(`- ${m.name} (${m.provider}) — $${m.pricing!.input_per_mtok}/M`);
  lines.push("");
  lines.push("Longest context window:");
  for (const m of longestContext) lines.push(`- ${m.name} (${m.provider}) — ${m.context_window!.toLocaleString()} tokens`);
  lines.push("");
  lines.push("Most adopted by tracked tools:");
  for (const x of mostUsed) lines.push(`- ${x.model!.name} (${x.model!.provider}) — used by ${x.count} tools`);
  lines.push("");

  lines.push("## Coverage");
  lines.push("");
  lines.push(`Providers: ${providersByCount.map(([p, n]) => `${p} (${n})`).join(", ")}`);
  lines.push(`Tool categories: ${categoriesByCount.map(([c, n]) => `${c} (${n})`).join(", ")}`);
  lines.push(`Repo categories: ${repoCategoriesByCount.map(([c, n]) => `${c} (${n})`).join(", ")}`);
  lines.push("");

  if (queue.available && queue.branches.length > 0) {
    lines.push("## Review queue");
    lines.push("");
    if (queue.totalQueued === 0) {
      lines.push("Empty: all submissions and ingest runs reviewed.");
    } else {
      for (const b of queue.branches) {
        const last = b.lastCommit ? ` — last update ${b.lastCommit.slice(0, 10)}` : "";
        lines.push(`- ${b.name}: ${b.commitsAhead} pending${last}`);
      }
    }
    lines.push("");
  }

  if (recent30.length > 0) {
    lines.push(`## Last 30 days (${recent30.length} events)`);
    lines.push("");
    for (const e of recent30.slice(0, 25)) {
      const ent = entityById(e.entity);
      const name = ent?.name ?? e.entity;
      lines.push(`- ${e.date} · ${e.type} · ${name} — ${e.summary} (${base}/events/${eventSlug(e)})`);
    }
    if (recent30.length > 25) lines.push(`- ...and ${recent30.length - 25} more — see ${base}/changes`);
    lines.push("");
  }

  lines.push(`## Models (${models.length})`);
  lines.push("");
  for (const m of sortedModels) {
    const price = m.pricing?.input_per_mtok != null ? ` · $${m.pricing.input_per_mtok}/M in` : "";
    const ctx = m.context_window ? ` · ${(m.context_window / 1000).toLocaleString()}K ctx` : "";
    lines.push(`- [${m.name}](${base}/models/${m.id}) — ${m.provider}, ${m.released ?? "n/a"}${ctx}${price}`);
  }
  lines.push("");

  lines.push(`## Tools (${tools.length})`);
  lines.push("");
  for (const t of sortedTools) {
    const oss = t.oss ? " · OSS" : "";
    const free = t.free_tier ? " · free tier" : "";
    lines.push(`- [${t.name}](${base}/tools/${t.id}) — ${t.vendor}, ${t.category}${oss}${free}`);
  }
  lines.push("");

  lines.push(`## Repos (${repos.length})`);
  lines.push("");
  for (const r of sortedRepos) {
    const stars = r.stars != null ? ` · ${r.stars.toLocaleString()} stars` : "";
    const lang = r.language ? ` · ${r.language}` : "";
    lines.push(`- [${r.full_name}](${base}/repos/${r.id}) — ${r.category}${lang}${stars}`);
  }
  lines.push("");

  lines.push(`## All events (${events.length})`);
  lines.push("");
  for (const e of events.slice(0, 50)) {
    lines.push(`- ${e.date} · ${e.type} · ${e.entity} — ${e.summary}`);
  }
  if (events.length > 50) lines.push(`- ...and ${events.length - 50} more — see ${base}/timeline or ${base}/feed.xml`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
