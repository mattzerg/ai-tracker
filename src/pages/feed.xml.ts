import type { APIRoute } from "astro";
import { entityById, loadEvents } from "../lib/data.ts";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(dateStr: string): string {
  // event dates are YYYY-MM-DD; we anchor to 12:00 UTC for stability.
  return new Date(dateStr + "T12:00:00Z").toUTCString();
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const events = loadEvents().slice(0, 100); // newest first
  const items = events.map((e) => {
    const ent = entityById(e.entity);
    const path = ent?.kind === "tool" ? `/tools/${e.entity}` : `/models/${e.entity}`;
    const url = base + path;
    const name = ent?.name ?? e.entity;
    const title = `${name} — ${e.type}`;
    const guid = `${e.date}__${e.entity}__${e.type}`;
    return `    <item>
      <title>${escape(title)}</title>
      <link>${escape(url)}</link>
      <guid isPermaLink="false">${escape(guid)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <category>${escape(e.type)}</category>
      <source url="${escape(e.source)}">${escape(e.source)}</source>
      <description>${escape(e.summary)}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ai-tracker — every event</title>
    <link>${escape(base)}</link>
    <description>Canonical machine-readable timeline of AI models and tools. Every release, price change, deprecation, and capability shift.</description>
    <language>en</language>
    <atom:link href="${escape(base)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
