import type { APIRoute } from "astro";
import { loadInfluencers } from "../lib/data.ts";

export const GET: APIRoute = () => {
  const list = loadInfluencers();
  if (!list) {
    return new Response(
      JSON.stringify({ schema_version: 1, generated_at: new Date().toISOString(), error: "No influencer list present." }),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  return new Response(JSON.stringify(list), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
};
