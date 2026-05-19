import type { APIRoute } from "astro";
import { loadRepoCandidateQueue } from "../../lib/data.ts";

export const GET: APIRoute = () => {
  const body = JSON.stringify(loadRepoCandidateQueue(), null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
};
