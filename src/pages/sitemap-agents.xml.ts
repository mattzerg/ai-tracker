import type { APIRoute } from "astro";
import { eventSlug, loadEvents, loadModels, loadTools } from "../lib/data.ts";

// Companion sitemap for agent-consumable endpoints: JSON twins, Markdown twins,
// bulk dumps, OG SVGs, feeds, and the MCP advertisement files. The default
// @astrojs/sitemap only lists HTML routes; agents looking for structured data
// shouldn't have to crawl HTML to find the JSON.

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: string): string {
  return `  <url>
    <loc>${escape(loc)}</loc>${lastmod ? `\n    <lastmod>${escape(lastmod)}</lastmod>` : ""}
  </url>`;
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);

  const urls: string[] = [];

  // Site-wide agent surfaces.
  urls.push(urlEntry(`${base}/llms.txt`, today));
  urls.push(urlEntry(`${base}/llms-full.txt`, today));
  urls.push(urlEntry(`${base}/dump/all.json`, today));
  urls.push(urlEntry(`${base}/dump/events-30d.json`, today));
  urls.push(urlEntry(`${base}/feed.xml`, today));
  urls.push(urlEntry(`${base}/api/votes.json`, today));

  // Per-entity twins + OG.
  for (const m of loadModels()) {
    const lm = m.pricing?.as_of ?? m.released ?? today;
    urls.push(urlEntry(`${base}/models/${m.id}.json`, lm));
    urls.push(urlEntry(`${base}/models/${m.id}.md`, lm));
    urls.push(urlEntry(`${base}/og/models/${m.id}.svg`, lm));
  }
  for (const t of loadTools()) {
    const lm = t.released ?? today;
    urls.push(urlEntry(`${base}/tools/${t.id}.json`, lm));
    urls.push(urlEntry(`${base}/tools/${t.id}.md`, lm));
    urls.push(urlEntry(`${base}/og/tools/${t.id}.svg`, lm));
  }

  // Event detail pages — added to the agent sitemap because their
  // structured data per event is consumption-grade.
  for (const e of loadEvents()) {
    urls.push(urlEntry(`${base}/events/${eventSlug(e)}`, e.date));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
