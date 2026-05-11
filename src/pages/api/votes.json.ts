import type { APIRoute } from "astro";

// Phase-4 contract stub. When the CF Worker for /upvote ships, this static
// file is replaced by a runtime endpoint that returns the actual KV-backed
// counts. Keys are entity ids (e.g. "anthropic__claude-opus-4-7"), values
// are vote counts. Empty until the worker lands.

export const GET: APIRoute = () => {
  const body = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      schema_version: 1,
      note: "Stub. Replaced by CF Worker at api.<domain>/votes once Phase 4 ships.",
      counts: {} as Record<string, number>,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
};
