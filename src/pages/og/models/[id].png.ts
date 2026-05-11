import type { APIRoute } from "astro";
import { loadModels } from "../../../lib/data.ts";
import { ogCardSvg, pngResponse } from "../../../lib/ogSvg.ts";

export function getStaticPaths() {
  return loadModels().map((m) => ({ params: { id: m.id }, props: { model: m } }));
}

export const GET: APIRoute = async ({ props }) => {
  const m = (props as any).model as ReturnType<typeof loadModels>[number];
  const ctx = m.context_window ? `${(m.context_window / 1000).toLocaleString()}K context` : "";
  const subtitle = [m.provider, ctx].filter(Boolean).join(" · ");
  const bullets: string[] = [];
  if (m.pricing?.input_per_mtok != null && m.pricing?.output_per_mtok != null) {
    bullets.push(`$${m.pricing.input_per_mtok}/M in · $${m.pricing.output_per_mtok}/M out`);
  } else if (m.pricing?.input_per_mtok != null) {
    bullets.push(`$${m.pricing.input_per_mtok}/M input`);
  }
  if (m.released) bullets.push(`released ${m.released}`);
  if (m.modalities?.length) bullets.push(m.modalities.join(" + "));
  const svg = ogCardSvg({ kind: "model", title: m.name, subtitle, bullets });
  return pngResponse(svg);
};
