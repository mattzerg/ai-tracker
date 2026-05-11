import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadTools } from "../../lib/data.ts";
import { loadQueueStatus } from "../../lib/queueStatus.ts";

export const GET: APIRoute = () => {
  const body = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      models: loadModels(),
      tools: loadTools(),
      events: loadEvents(),
      review_queue: loadQueueStatus(),
    },
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
