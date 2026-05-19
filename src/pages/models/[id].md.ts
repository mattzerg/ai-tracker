import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadModels } from "../../lib/data.ts";
import type { Model } from "../../../schemas/index.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadModels().map((m) => ({ params: { id: m.id }, props: { model: m } }));

function render(model: Model): string {
  const events = eventsForEntity(model.id);
  const apiId = model.id.replace(`${model.provider}__`, "");
  const lines: string[] = [];
  lines.push(`# ${model.name}`);
  lines.push("");
  lines.push(`**Provider:** ${model.provider}`);
  lines.push(`**Canonical ID:** ${model.id}`);
  lines.push(`**API-style ID:** ${apiId}`);
  lines.push(`**Released:** ${model.released ?? "n/a"}`);
  lines.push(`**Status:** ${model.status}`);
  lines.push(`**License:** ${model.license}`);
  if (model.context_window) lines.push(`**Context window:** ${model.context_window.toLocaleString()} tokens`);
  if (model.output_window) lines.push(`**Output window:** ${model.output_window.toLocaleString()} tokens`);
  lines.push(`**Modalities:** ${model.modalities.join(", ")}`);
  if (model.tags.length) lines.push(`**Tags:** ${model.tags.join(", ")}`);
  if (model.pricing) {
    lines.push("");
    lines.push(`**Pricing** (as of ${model.pricing.as_of}):`);
    if (model.pricing.input_per_mtok != null) lines.push(`- Input: $${model.pricing.input_per_mtok}/M tokens`);
    if (model.pricing.output_per_mtok != null) lines.push(`- Output: $${model.pricing.output_per_mtok}/M tokens`);
    if (model.pricing.cached_input_per_mtok != null) lines.push(`- Cached input: $${model.pricing.cached_input_per_mtok}/M tokens`);
  }
  if (Object.keys(model.links).length) {
    lines.push("");
    lines.push("## Developer links");
    if (model.links.docs) lines.push(`- Docs: ${model.links.docs}`);
    if (model.links.homepage) lines.push(`- Homepage: ${model.links.homepage}`);
    if (model.links.card) lines.push(`- Model card / release: ${model.links.card}`);
    if (model.links.paper) lines.push(`- Paper: ${model.links.paper}`);
  }
  if (model.benchmarks && Object.keys(model.benchmarks).length) {
    lines.push("");
    lines.push("## Benchmarks");
    for (const [k, v] of Object.entries(model.benchmarks)) lines.push(`- ${k}: ${v}`);
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
  for (const s of model.sources) lines.push(`- ${s}`);
  lines.push("");
  return lines.join("\n");
}

export const GET: APIRoute = ({ props }) => {
  const model = (props as { model: Model }).model;
  return new Response(render(model), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
