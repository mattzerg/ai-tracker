import type { APIRoute } from "astro";
import { loadTools } from "../../../lib/data.ts";
import { ogCardSvg, pngResponse } from "../../../lib/ogSvg.ts";

export function getStaticPaths() {
  return loadTools().map((t) => ({ params: { id: t.id }, props: { tool: t } }));
}

export const GET: APIRoute = async ({ props }) => {
  const t = (props as any).tool as ReturnType<typeof loadTools>[number];
  const subtitle = [t.vendor, t.category].filter(Boolean).join(" · ");
  const bullets: string[] = [];
  const cheapestPaid = t.pricing_tiers
    .filter((tier) => tier.monthly_usd != null && tier.monthly_usd > 0)
    .sort((a, b) => a.monthly_usd! - b.monthly_usd!)[0];
  if (t.free_tier && cheapestPaid) {
    bullets.push(`Free tier · ${cheapestPaid.name} from $${cheapestPaid.monthly_usd}/mo${cheapestPaid.per_seat ? "/seat" : ""}`);
  } else if (cheapestPaid) {
    bullets.push(`From $${cheapestPaid.monthly_usd}/mo${cheapestPaid.per_seat ? "/seat" : ""}`);
  } else if (t.free_tier) {
    bullets.push("Free tier available");
  }
  if (t.oss) bullets.push("Open source");
  if (t.released) bullets.push(`released ${t.released}`);
  const svg = ogCardSvg({ kind: "tool", title: t.name, subtitle, bullets });
  return pngResponse(svg);
};
