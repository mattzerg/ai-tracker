import type { APIRoute } from "astro";
import { entityById, eventSlug, loadEvents } from "../lib/data.ts";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc3339(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toISOString();
}

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const events = loadEvents().slice(0, 100);
  const updated = events.length ? rfc3339(events[0].date) : new Date().toISOString();

  const entries = events.map((e) => {
    const ent = entityById(e.entity);
    const slug = eventSlug(e);
    const url = `${base}/events/${slug}`;
    const name = ent?.name ?? e.entity;
    const title = `${name} — ${e.type}`;
    return `  <entry>
    <title>${escape(title)}</title>
    <id>${escape(url)}</id>
    <link href="${escape(url)}" rel="alternate" type="text/html"/>
    <link href="${escape(e.source)}" rel="related" type="text/html"/>
    <updated>${rfc3339(e.date)}</updated>
    <published>${rfc3339(e.date)}</published>
    <category term="${escape(e.type)}"/>
    <author><name>${escape(e.submitted_by)}</name></author>
    <summary type="text">${escape(e.summary)}</summary>
  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ai-tracker — every event</title>
  <subtitle>Canonical machine-readable timeline of AI models and tools.</subtitle>
  <id>${escape(base)}/atom.xml</id>
  <link href="${escape(base)}/atom.xml" rel="self" type="application/atom+xml"/>
  <link href="${escape(base)}" rel="alternate" type="text/html"/>
  <updated>${updated}</updated>
${entries}
</feed>
`;
  return new Response(xml, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
