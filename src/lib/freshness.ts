import type { Event, Model, Repo, Tool } from "../../schemas/index.ts";

export type FreshnessSubject = Model | Tool | Repo;

export interface FreshnessInfo {
  label: string;
  date: string | null;
  source: string;
  tone: "fresh" | "stale" | "unknown";
}

function daysSince(date: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(`${date}T12:00:00Z`).getTime()) / 86400000));
}

export function ageLabel(date: string | null): string {
  if (!date) return "unknown";
  const days = daysSince(date);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 31) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function toneFor(date: string | null): FreshnessInfo["tone"] {
  if (!date) return "unknown";
  return daysSince(date) <= 45 ? "fresh" : "stale";
}

export function latestEntityDate(entity: FreshnessSubject, events: Event[] = []): string | null {
  const released = entity.kind === "repo" ? null : entity.released;
  const dates = [
    entity.kind === "model" ? entity.pricing?.as_of ?? null : null,
    entity.kind === "repo" ? entity.pushed_at ?? null : null,
    released ?? null,
    ...events.map((event) => event.date),
  ].filter((date): date is string => Boolean(date));
  return dates.sort().at(-1) ?? null;
}

export function freshnessForEntity(entity: FreshnessSubject, events: Event[] = []): FreshnessInfo {
  const date = latestEntityDate(entity, events);
  let source = "latest tracked source";
  if (entity.kind === "model" && entity.pricing?.as_of === date) source = "pricing snapshot";
  if (entity.kind === "repo" && entity.pushed_at === date) source = "GitHub pushed_at";
  if (events.some((event) => event.date === date)) source = "latest timeline event";
  if (entity.kind !== "repo" && entity.released === date) source = "release date";
  return {
    label: date ? `Checked ${ageLabel(date)}` : "Freshness unknown",
    date,
    source,
    tone: toneFor(date),
  };
}

export function catalogFreshness(events: Event[], models: Model[], repos: Repo[]): FreshnessInfo {
  const dates = [
    ...events.map((event) => event.date),
    ...models.map((model) => model.pricing?.as_of ?? null),
    ...repos.map((repo) => repo.pushed_at ?? null),
  ].filter((date): date is string => Boolean(date));
  const date = dates.sort().at(-1) ?? null;
  return {
    label: date ? `Latest tracked update ${ageLabel(date)}` : "No tracked updates yet",
    date,
    source: "events, pricing snapshots, and repo metadata",
    tone: toneFor(date),
  };
}
