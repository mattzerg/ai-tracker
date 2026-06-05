import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  concordSummarySchema,
  eventSchema,
  influencerListSchema,
  modelSchema,
  repoCandidateQueueSchema,
  repoSchema,
  toolSchema,
  type ConcordSummary,
  type Event,
  type InfluencerList,
  type Model,
  type RepoCandidateQueue,
  type Repo,
  type Tool,
} from "../../schemas/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(__dirname, "../../data");
const CACHE_DATA = process.env.NODE_ENV !== "development";

function loadJsonDir<T>(dir: string, parse: (raw: unknown, file: string) => T): T[] {
  const full = join(DATA_ROOT, dir);
  let files: string[];
  try {
    files = readdirSync(full).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(full, f), "utf8")) as unknown;
    } catch (err) {
      throw new Error(`${dir}/${f}: invalid JSON - ${(err as Error).message}`);
    }
    return parse(raw, f);
  });
}

let _models: Model[] | null = null;
let _tools: Tool[] | null = null;
let _repos: Repo[] | null = null;
let _repoCandidateQueue: RepoCandidateQueue | null = null;
let _events: Event[] | null = null;

export function loadModels(): Model[] {
  if (CACHE_DATA && _models) return [..._models];
  const models = loadJsonDir("models", (raw, file) => {
    const r = modelSchema.safeParse(raw);
    if (!r.success) throw new Error(`models/${file}: ${r.error.message}`);
    return r.data;
  });
  if (CACHE_DATA) _models = models;
  return [...models];
}

export function loadTools(): Tool[] {
  if (CACHE_DATA && _tools) return [..._tools];
  const tools = loadJsonDir("tools", (raw, file) => {
    const r = toolSchema.safeParse(raw);
    if (!r.success) throw new Error(`tools/${file}: ${r.error.message}`);
    return r.data;
  });
  if (CACHE_DATA) _tools = tools;
  return [...tools];
}

let _concordSummary: ConcordSummary | null | undefined = undefined;
let _influencerList: InfluencerList | null | undefined = undefined;

export function loadInfluencers(): InfluencerList | null {
  if (CACHE_DATA && _influencerList !== undefined) return _influencerList;
  const path = resolve(DATA_ROOT, "influencers.json");
  if (!existsSync(path)) {
    if (CACHE_DATA) _influencerList = null;
    return null;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const r = influencerListSchema.safeParse(raw);
  if (!r.success) throw new Error(`influencers.json: ${r.error.message}`);
  if (CACHE_DATA) _influencerList = r.data;
  return r.data;
}

export function loadConcordSummary(): ConcordSummary | null {
  if (CACHE_DATA && _concordSummary !== undefined) return _concordSummary;
  const path = resolve(DATA_ROOT, "concord-summary.json");
  if (!existsSync(path)) {
    if (CACHE_DATA) _concordSummary = null;
    return null;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const r = concordSummarySchema.safeParse(raw);
  if (!r.success) throw new Error(`concord-summary.json: ${r.error.message}`);
  if (CACHE_DATA) _concordSummary = r.data;
  return r.data;
}

export function loadRepos(): Repo[] {
  if (CACHE_DATA && _repos) return [..._repos];
  const repos = loadJsonDir("repos", (raw, file) => {
    const r = repoSchema.safeParse(raw);
    if (!r.success) throw new Error(`repos/${file}: ${r.error.message}`);
    return r.data;
  }).sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.full_name.localeCompare(b.full_name));
  if (CACHE_DATA) _repos = repos;
  return [...repos];
}

export function loadRepoCandidateQueue(): RepoCandidateQueue {
  if (CACHE_DATA && _repoCandidateQueue) return _repoCandidateQueue;
  const queues = loadJsonDir("repo-candidates", (raw, file) => {
    const r = repoCandidateQueueSchema.safeParse(raw);
    if (!r.success) throw new Error(`repo-candidates/${file}: ${r.error.message}`);
    return r.data;
  });
  let queue: RepoCandidateQueue;
  if (queues.length === 0) {
    queue = {
      kind: "repo-candidate-queue" as const,
      source: "none",
      generated_at: new Date(0).toISOString(),
      candidates: [],
    };
  } else if (queues.length === 1) {
    queue = queues[0];
  } else {
    queue = repoCandidateQueueSchema.parse({
      kind: "repo-candidate-queue" as const,
      source: queues.map((q) => q.source).sort().join(","),
      generated_at: queues.map((q) => q.generated_at).sort().at(-1) ?? new Date(0).toISOString(),
      candidates: Array.from(
        new Map(queues.flatMap((q) => q.candidates).map((candidate) => [candidate.id, candidate])).values(),
      ).sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.full_name.localeCompare(b.full_name)),
    });
  }
  if (CACHE_DATA) _repoCandidateQueue = queue;
  return queue;
}

export function loadEvents(): Event[] {
  if (CACHE_DATA && _events) return [..._events];
  const events = loadJsonDir("events", (raw, file) => {
    const r = eventSchema.safeParse(raw);
    if (!r.success) throw new Error(`events/${file}: ${r.error.message}`);
    return r.data;
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (CACHE_DATA) _events = events;
  return [...events];
}

export function eventsForEntity(id: string): Event[] {
  return loadEvents().filter((e) => e.entity === id);
}

export function eventSlug(e: Event): string {
  return `${e.date}__${e.entity}__${e.type}`;
}

export function entityById(id: string): Model | Tool | Repo | undefined {
  return loadModels().find((m) => m.id === id) ?? loadTools().find((t) => t.id === id) ?? loadRepos().find((r) => r.id === id);
}

/**
 * Event summaries conventionally start with the entity name ("Claude Opus 4.8
 * generally available — ..." / "Gemini 3.5 Flash released by google. ...").
 * Pages that already render the entity name next to the summary should use this
 * to strip the redundant prefix, otherwise the name appears twice in a row.
 */
export function dedupedEventSummary(summary: string, entityName?: string): string {
  if (!entityName || !summary.startsWith(entityName)) return summary;
  let rest = summary.slice(entityName.length);
  // Strip joining phrases that restate the event type / provider, which the
  // surrounding row already communicates via the type chip + entity link.
  rest = rest.replace(/^\s*(released by \w+\.|generally available)?\s*[—:–-]*\s*/i, "");
  if (!rest) return summary;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
