import type { APIRoute } from "astro";
import { entityById, loadSignalsIndex } from "../lib/data.ts";

// Public reference-signal index. Machine-readable surface for the signals layer
// (data/signals/index.json): per-entity signal score, per-type mention counts,
// and the public-safe mentions themselves. Privacy contract is enforced by the
// local miner (scripts/signals/) — this endpoint publishes the file verbatim,
// enriched with the tracked entity's display name/kind where the id resolves.
//
// Shape:
//   { schema_version, generated_at,
//     entities: { <id>: { signal_score, counts, mentions, updated_at,
//                         name?, kind? } } }

export const GET: APIRoute = () => {
  const index = loadSignalsIndex();
  const entities: Record<string, unknown> = {};
  if (index) {
    for (const [id, sig] of Object.entries(index.entities)) {
      const ent = entityById(id);
      entities[id] = ent ? { ...sig, name: ent.name, kind: ent.kind } : sig;
    }
  }
  const body = JSON.stringify({
    schema_version: 1,
    generated_at: index?.generated_at ?? new Date().toISOString(),
    entity_count: Object.keys(entities).length,
    entities,
  });
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
