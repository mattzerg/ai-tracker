import type { APIRoute } from "astro";
import { loadModels } from "../../../lib/data.ts";
import { ogCardSvg, svgResponse } from "../../../lib/ogSvg.ts";
import { providerColor } from "../../../lib/providerColors.ts";

export function getStaticPaths() {
  return loadModels().map((m) => ({ params: { id: m.id }, props: { model: m } }));
}

export const GET: APIRoute = ({ props }) => {
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
  const initials = m.provider.slice(0, 2).toUpperCase();
  return svgResponse(ogCardSvg({
    kind: "model",
    title: m.name,
    subtitle,
    bullets,
    accent: providerColor(m.provider),
    monogram: { text: initials, color: providerColor(m.provider) },
  }));
};
