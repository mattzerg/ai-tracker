import type { APIRoute } from "astro";
import { entityById, eventSlug, loadEvents, loadModels, loadTools } from "../../lib/data.ts";

// Lean search-shaped index. Smaller than /dump/all.json (which dumps every
// field). Designed for agents that want fuzzy lookup over names + tags
// without pulling pricing offers, sources, full event objects, etc.
//
// Shape:
//   { generated_at, models: [{id,name,provider,kind,context,tags,license}],
//     tools: [{id,name,vendor,category,kind,oss,free_tier,tags,built_on}],
//     events: [{slug,date,type,entity,entity_name,summary}] }
//
// Cache-control 1h since this is denormalized.

export const GET: APIRoute = () => {
  const models = loadModels().map((m) => ({
    kind: "model" as const,
    id: m.id,
    name: m.name,
    provider: m.provider,
    context: m.context_window ?? null,
    tags: m.tags,
    license: m.license,
    input_price: m.pricing?.input_per_mtok ?? null,
    output_price: m.pricing?.output_per_mtok ?? null,
  }));
  const tools = loadTools().map((t) => ({
    kind: "tool" as const,
    id: t.id,
    name: t.name,
    vendor: t.vendor,
    category: t.category,
    oss: t.oss,
    free_tier: t.free_tier,
    tags: t.tags,
    built_on: t.built_on_models,
  }));
  const events = loadEvents().map((e) => {
    const ent = entityById(e.entity);
    return {
      slug: eventSlug(e),
      date: e.date,
      type: e.type,
      entity: e.entity,
      entity_name: ent?.name ?? null,
      summary: e.summary,
    };
  });

  const body = JSON.stringify({
    generated_at: new Date().toISOString(),
    schema_version: 1,
    models,
    tools,
    events,
  });
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
};
