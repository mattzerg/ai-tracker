import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadTools } from "../lib/data.ts";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const models = loadModels().sort((a, b) => (b.released ?? "0").localeCompare(a.released ?? "0"));
  const tools = loadTools().sort((a, b) => b.released.localeCompare(a.released));
  const events = loadEvents();

  const lines: string[] = [];
  lines.push("# ai-tracker");
  lines.push("");
  lines.push("Canonical machine-readable timeline of AI models and tools.");
  lines.push("Designed to be consumed by agents. Every entity has HTML, JSON, and Markdown twins.");
  lines.push("");
  lines.push(`- Site: ${base}`);
  lines.push(`- Bulk JSON: ${base}/dump/all.json`);
  lines.push(`- 30-day events: ${base}/dump/events-30d.json`);
  lines.push(`- Full text: ${base}/llms-full.txt`);
  lines.push(`- MCP server: npm install -g ai-tracker-mcp (Phase 5)`);
  lines.push("");
  lines.push(`## Models (${models.length})`);
  lines.push("");
  for (const m of models) {
    lines.push(`- [${m.name}](${base}/models/${m.id}) — ${m.provider}, ${m.released ?? "n/a"}`);
  }
  lines.push("");
  lines.push(`## Tools (${tools.length})`);
  lines.push("");
  for (const t of tools) {
    lines.push(`- [${t.name}](${base}/tools/${t.id}) — ${t.vendor}, ${t.category}`);
  }
  lines.push("");
  lines.push(`## Recent events (${Math.min(events.length, 50)} of ${events.length})`);
  lines.push("");
  for (const e of events.slice(0, 50)) {
    lines.push(`- ${e.date} — ${e.entity} — ${e.type} — ${e.summary}`);
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
