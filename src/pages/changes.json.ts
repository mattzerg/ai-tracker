import type { APIRoute } from "astro";
import { entityById, eventSlug, loadEvents } from "../lib/data.ts";

// ISO-week-bucketed change feed. Machine-readable companion to /changes.
//
// Shape:
//   { schema_version, generated_at,
//     weeks: [{
//       week_start, week_end, count,
//       by_type: { released: N, price_change: N, ... },
//       by_provider: { anthropic: N, openai: N, ... },
//       events: [{slug, date, type, entity, entity_name, entity_kind, summary, source}]
//     }] }

function isoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayOfWeek = d.getUTCDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + offsetToMonday);
  return d.toISOString().slice(0, 10);
}

function isoWeekEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function entityProvider(id: string): string {
  const ent = entityById(id);
  if (!ent) return "—";
  if (ent.kind === "model") return (ent as { provider: string }).provider;
  if (ent.kind === "tool") return (ent as { vendor: string }).vendor;
  return (ent as { owner: string }).owner ?? "—";
}

interface LeanEvent {
  slug: string;
  date: string;
  type: string;
  entity: string;
  entity_name: string;
  entity_kind: string;
  summary: string;
  source: string;
}

interface WeekBucket {
  week_start: string;
  week_end: string;
  count: number;
  by_type: Record<string, number>;
  by_provider: Record<string, number>;
  events: LeanEvent[];
}

export const GET: APIRoute = () => {
  const events = loadEvents();
  const buckets = new Map<string, WeekBucket>();

  for (const e of events) {
    const ws = isoWeekStart(e.date);
    if (!buckets.has(ws)) {
      buckets.set(ws, {
        week_start: ws,
        week_end: isoWeekEnd(ws),
        count: 0,
        by_type: {},
        by_provider: {},
        events: [],
      });
    }
    const b = buckets.get(ws)!;
    b.count += 1;
    b.by_type[e.type] = (b.by_type[e.type] ?? 0) + 1;
    const provider = entityProvider(e.entity);
    b.by_provider[provider] = (b.by_provider[provider] ?? 0) + 1;
    const ent = entityById(e.entity);
    b.events.push({
      slug: eventSlug(e),
      date: e.date,
      type: e.type,
      entity: e.entity,
      entity_name: ent?.name ?? e.entity,
      entity_kind: ent?.kind ?? "unknown",
      summary: e.summary,
      source: e.source,
    });
  }

  const weeks = Array.from(buckets.values()).sort((a, b) => b.week_start.localeCompare(a.week_start));

  const body = JSON.stringify({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    total_events: events.length,
    total_weeks: weeks.length,
    weeks,
  });
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
