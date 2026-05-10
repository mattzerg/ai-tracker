import type { APIRoute } from "astro";
import { loadEvents } from "../../lib/data.ts";

export const GET: APIRoute = () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const events = loadEvents().filter((e) => e.date >= cutoff);
  const body = JSON.stringify(
    { generated_at: new Date().toISOString(), since: cutoff, count: events.length, events },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
