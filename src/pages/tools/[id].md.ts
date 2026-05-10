import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadTools } from "../../lib/data.ts";
import type { Tool } from "../../../schemas/index.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadTools().map((t) => ({ params: { id: t.id }, props: { tool: t } }));

function render(tool: Tool): string {
  const events = eventsForEntity(tool.id);
  const lines: string[] = [];
  lines.push(`# ${tool.name}`);
  lines.push("");
  lines.push(`**Vendor:** ${tool.vendor}`);
  lines.push(`**Category:** ${tool.category}`);
  lines.push(`**Released:** ${tool.released ?? "n/a"}`);
  lines.push(`**Open source:** ${tool.oss ? "yes" : "no"}`);
  if (tool.built_on_models.length) lines.push(`**Built on:** ${tool.built_on_models.join(", ")}`);
  if (tool.pricing_tiers.length) {
    lines.push("");
    lines.push("## Pricing");
    for (const p of tool.pricing_tiers) {
      const price =
        p.monthly_usd === 0 ? "free" : p.monthly_usd != null ? `$${p.monthly_usd}/mo` : "contact sales";
      lines.push(`- **${p.name}:** ${price}${p.per_seat ? " per seat" : ""}${p.notes ? ` — ${p.notes}` : ""}`);
    }
  }
  lines.push("");
  lines.push("## Timeline");
  if (events.length === 0) {
    lines.push("");
    lines.push("_No events recorded yet._");
  } else {
    for (const e of events) lines.push(`- ${e.date} — **${e.type}** — ${e.summary} ([source](${e.source}))`);
  }
  lines.push("");
  lines.push("## Sources");
  for (const s of tool.sources) lines.push(`- ${s}`);
  lines.push("");
  return lines.join("\n");
}

export const GET: APIRoute = ({ props }) => {
  const tool = (props as { tool: Tool }).tool;
  return new Response(render(tool), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
