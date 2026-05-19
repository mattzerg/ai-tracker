import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadRepos, loadTools } from "../../lib/data.ts";
import { ogCardSvg, pngResponse } from "../../lib/ogSvg.ts";

export const GET: APIRoute = async () => {
  const m = loadModels().length;
  const t = loadTools().length;
  const r = loadRepos().length;
  const e = loadEvents().length;
  const svg = ogCardSvg({
    kind: "site",
    title: "ai-tracker",
    subtitle: "Canonical timeline of AI models, tools, and repos",
    bullets: [
      `${m} models · ${t} tools · ${r} repos · ${e} events`,
      "Designed to be consumed by agents",
      "JSON twins · /llms.txt · MCP server · RSS · Atom",
    ],
  });
  return pngResponse(svg);
};
