import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadRepoCandidateQueue, loadRepos, loadTools } from "../../lib/data.ts";
import { loadQueueStatus } from "../../lib/queueStatus.ts";

export const GET: APIRoute = () => {
  const body = JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      models: loadModels(),
      tools: loadTools(),
      repos: loadRepos(),
      repo_candidates: loadRepoCandidateQueue(),
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
