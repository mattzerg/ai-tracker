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

type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

interface EntryOpts {
  lastmod?: string;
  changefreq?: ChangeFreq;
  priority?: number;
}

function urlEntry(loc: string, opts: EntryOpts = {}): string {
  const parts = [
    `    <loc>${escape(loc)}</loc>`,
    opts.lastmod ? `    <lastmod>${escape(opts.lastmod)}</lastmod>` : "",
    opts.changefreq ? `    <changefreq>${opts.changefreq}</changefreq>` : "",
    opts.priority != null ? `    <priority>${opts.priority.toFixed(1)}</priority>` : "",
  ].filter(Boolean);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);

  const urls: string[] = [];

  // Site-wide agent surfaces.
  // - Hot canonical dumps: daily change, top priority (agents should re-fetch often).
  urls.push(urlEntry(`${base}/dump/all.json`, { lastmod: today, changefreq: "daily", priority: 1.0 }));
  urls.push(urlEntry(`${base}/dump/events-30d.json`, { lastmod: today, changefreq: "daily", priority: 1.0 }));
  urls.push(urlEntry(`${base}/feed.xml`, { lastmod: today, changefreq: "daily", priority: 0.9 }));
  urls.push(urlEntry(`${base}/atom.xml`, { lastmod: today, changefreq: "daily", priority: 0.9 }));
  urls.push(urlEntry(`${base}/llms.txt`, { lastmod: today, changefreq: "daily", priority: 0.9 }));
  urls.push(urlEntry(`${base}/llms-full.txt`, { lastmod: today, changefreq: "daily", priority: 0.8 }));
  // - Stub: low change/priority until Worker ships.
  urls.push(urlEntry(`${base}/api/votes.json`, { lastmod: today, changefreq: "monthly", priority: 0.2 }));

  // Per-entity twins: change weekly when pricing or specs update; high priority
  // because LLMs querying for a specific model land here first.
  for (const m of loadModels()) {
    const lm = m.pricing?.as_of ?? m.released ?? today;
    urls.push(urlEntry(`${base}/models/${m.id}.json`, { lastmod: lm, changefreq: "weekly", priority: 0.8 }));
    urls.push(urlEntry(`${base}/models/${m.id}.md`, { lastmod: lm, changefreq: "weekly", priority: 0.7 }));
    urls.push(urlEntry(`${base}/og/models/${m.id}.svg`, { lastmod: lm, changefreq: "monthly", priority: 0.3 }));
    urls.push(urlEntry(`${base}/og/models/${m.id}.png`, { lastmod: lm, changefreq: "monthly", priority: 0.3 }));
  }
  for (const t of loadTools()) {
    const lm = t.released ?? today;
    urls.push(urlEntry(`${base}/tools/${t.id}.json`, { lastmod: lm, changefreq: "weekly", priority: 0.7 }));
    urls.push(urlEntry(`${base}/tools/${t.id}.md`, { lastmod: lm, changefreq: "weekly", priority: 0.6 }));
    urls.push(urlEntry(`${base}/og/tools/${t.id}.svg`, { lastmod: lm, changefreq: "monthly", priority: 0.3 }));
    urls.push(urlEntry(`${base}/og/tools/${t.id}.png`, { lastmod: lm, changefreq: "monthly", priority: 0.3 }));
  }

  // Event detail pages — append-only, never change after creation. Low changefreq,
  // but priority decays with age (recent events ≈ news; old events ≈ archive).
  const now = new Date();
  for (const e of loadEvents()) {
    const ageMs = now.getTime() - new Date(e.date + "T12:00:00Z").getTime();
    const ageDays = ageMs / 86400000;
    const priority = ageDays < 30 ? 0.7 : ageDays < 180 ? 0.4 : 0.2;
    urls.push(urlEntry(`${base}/events/${eventSlug(e)}`, { lastmod: e.date, changefreq: "yearly", priority }));
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
