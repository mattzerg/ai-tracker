import type { APIRoute } from "astro";
import { eventsForEntity, loadEvents, loadModels, loadRepoCandidateQueue, loadRepos, loadTools } from "../lib/data.ts";
import type { Model, Repo, Tool } from "../../schemas/index.ts";

function renderModel(m: Model, base: string): string[] {
  const out: string[] = [];
  out.push(`## ${m.name}  (${base}/models/${m.id})`);
  out.push("");
  out.push(`Provider: ${m.provider}`);
  out.push(`Released: ${m.released ?? "n/a"}`);
  out.push(`License: ${m.license}`);
  if (m.context_window) out.push(`Context: ${m.context_window.toLocaleString()} tokens`);
  if (m.output_window) out.push(`Max output: ${m.output_window.toLocaleString()} tokens`);
  out.push(`Modalities: ${m.modalities.join(", ")}`);
  if (m.pricing) {
    const inP = m.pricing.input_per_mtok != null ? `$${m.pricing.input_per_mtok}/M in` : "";
    const outP = m.pricing.output_per_mtok != null ? `$${m.pricing.output_per_mtok}/M out` : "";
    out.push(`Pricing (${m.pricing.as_of}): ${[inP, outP].filter(Boolean).join(" · ")}`);
  }
  if (m.benchmarks && Object.keys(m.benchmarks).length) {
    out.push("Benchmarks:");
    for (const [k, v] of Object.entries(m.benchmarks)) out.push(`  - ${k}: ${v}`);
  }
  const events = eventsForEntity(m.id);
  if (events.length) {
    out.push("Timeline:");
    for (const e of events) out.push(`  - ${e.date} · ${e.type} · ${e.summary}`);
  }
  out.push("Sources:");
  for (const s of m.sources) out.push(`  - ${s}`);
  out.push("");
  return out;
}

function renderTool(t: Tool, base: string): string[] {
  const out: string[] = [];
  out.push(`## ${t.name}  (${base}/tools/${t.id})`);
  out.push("");
  out.push(`Vendor: ${t.vendor}`);
  out.push(`Category: ${t.category}`);
  out.push(`Released: ${t.released ?? "n/a"}`);
  out.push(`Open source: ${t.oss ? "yes" : "no"}`);
  out.push(`Free tier: ${t.free_tier ? "yes" : "no"}`);
  if (t.built_on_models.length) out.push(`Built on: ${t.built_on_models.join(", ")}`);
  if (t.pricing_tiers.length) {
    out.push("Pricing:");
    for (const p of t.pricing_tiers) {
      const price =
        p.monthly_usd === 0 ? "free" : p.monthly_usd != null ? `$${p.monthly_usd}/mo` : "contact";
      out.push(`  - ${p.name}: ${price}${p.per_seat ? " per seat" : ""}`);
    }
  }
  const events = eventsForEntity(t.id);
  if (events.length) {
    out.push("Timeline:");
    for (const e of events) out.push(`  - ${e.date} · ${e.type} · ${e.summary}`);
  }
  out.push("Sources:");
  for (const s of t.sources) out.push(`  - ${s}`);
  out.push("");
  return out;
}

function renderRepo(r: Repo, base: string): string[] {
  const out: string[] = [];
  out.push(`## ${r.full_name}  (${base}/repos/${r.id})`);
  out.push("");
  out.push(`Category: ${r.category}`);
  out.push(`Language: ${r.language ?? "n/a"}`);
  out.push(`License: ${r.license ?? "n/a"}`);
  out.push(`Stars: ${r.stars ?? "n/a"}`);
  out.push(`Forks: ${r.forks ?? "n/a"}`);
  out.push(`Created: ${r.created_at ?? "n/a"}`);
  out.push(`Pushed: ${r.pushed_at ?? "n/a"}`);
  out.push(`Archived: ${r.archived ? "yes" : "no"}`);
  if (r.description) out.push(`Description: ${r.description}`);
  if (r.topics.length || r.tags.length) out.push(`Topics: ${Array.from(new Set([...r.topics, ...r.tags])).join(", ")}`);
  const events = eventsForEntity(r.id);
  if (events.length) {
    out.push("Timeline:");
    for (const e of events) out.push(`  - ${e.date} · ${e.type} · ${e.summary}`);
  }
  out.push("Sources:");
  for (const s of r.sources) out.push(`  - ${s}`);
  out.push("");
  return out;
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const models = loadModels().sort((a, b) => (b.released ?? "0").localeCompare(a.released ?? "0"));
  const tools = loadTools().sort((a, b) => (b.released ?? "0").localeCompare(a.released ?? "0"));
  const repos = loadRepos().sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.full_name.localeCompare(b.full_name));
  const repoCandidateQueue = loadRepoCandidateQueue();
  const events = loadEvents();

  const lines: string[] = [];
  lines.push("# ai-tracker — full corpus");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()}.`);
  lines.push(`${models.length} models, ${tools.length} tools, ${repos.length} repos, ${repoCandidateQueue.candidates.length} repo candidates, ${events.length} events.`);
  lines.push("");
  lines.push("# Models");
  lines.push("");
  for (const m of models) lines.push(...renderModel(m, base));
  lines.push("# Tools");
  lines.push("");
  for (const t of tools) lines.push(...renderTool(t, base));
  lines.push("# Repos");
  lines.push("");
  for (const r of repos) lines.push(...renderRepo(r, base));
  if (repoCandidateQueue.candidates.length) {
    lines.push("# Repo candidates");
    lines.push("");
    lines.push(`Generated: ${repoCandidateQueue.generated_at}`);
    lines.push(`JSON: ${base}/repos/candidates.json`);
    lines.push("");
    for (const r of repoCandidateQueue.candidates.slice(0, 75)) {
      const stars = r.stars != null ? ` · ${r.stars.toLocaleString()} stars` : "";
      const lang = r.language ? ` · ${r.language}` : "";
      lines.push(`- ${r.full_name} — ${r.category}${lang}${stars} (${r.repo_url})`);
    }
    if (repoCandidateQueue.candidates.length > 75) {
      lines.push(`- ...and ${repoCandidateQueue.candidates.length - 75} more in ${base}/repos/candidates.json`);
    }
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
