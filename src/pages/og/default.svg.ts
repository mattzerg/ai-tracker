import type { APIRoute } from "astro";
import { loadEvents, loadModels, loadTools } from "../../lib/data.ts";
import { ogCardSvg, svgResponse } from "../../lib/ogSvg.ts";

export const GET: APIRoute = () => {
  const m = loadModels().length;
  const t = loadTools().length;
  const e = loadEvents().length;
  const svg = ogCardSvg({
    kind: "site",
    title: "ai-tracker",
    subtitle: "Canonical timeline of AI models and tools",
    bullets: [
      `${m} models · ${t} tools · ${e} events`,
      "Designed to be consumed by agents",
      "JSON twins · /llms.txt · MCP server · RSS · Atom",
    ],
  });
  return svgResponse(svg);
};
