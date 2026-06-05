import type { APIRoute } from "astro";
import { loadConcordSummary } from "../lib/data.ts";

// Machine-readable Concord benchmark summary. Mirrors /concord HTML.

export const GET: APIRoute = () => {
  const summary = loadConcordSummary();
  if (!summary) {
    return new Response(
      JSON.stringify({
        schema_version: 1,
        generated_at: new Date().toISOString(),
        error: "No Concord summary file present.",
      }),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  return new Response(JSON.stringify(summary), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
};
