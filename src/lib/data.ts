import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventSchema, modelSchema, toolSchema, type Event, type Model, type Tool } from "../../schemas/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = resolve(__dirname, "../../data");

function loadJsonDir<T>(dir: string, parse: (raw: unknown, file: string) => T): T[] {
  const full = join(DATA_ROOT, dir);
  let files: string[];
  try {
    files = readdirSync(full).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(full, f), "utf8")) as unknown;
    return parse(raw, f);
  });
}

let _models: Model[] | null = null;
let _tools: Tool[] | null = null;
let _events: Event[] | null = null;

export function loadModels(): Model[] {
  if (_models) return _models;
  _models = loadJsonDir("models", (raw, file) => {
    const r = modelSchema.safeParse(raw);
    if (!r.success) throw new Error(`models/${file}: ${r.error.message}`);
    return r.data;
  });
  return _models;
}

export function loadTools(): Tool[] {
  if (_tools) return _tools;
  _tools = loadJsonDir("tools", (raw, file) => {
    const r = toolSchema.safeParse(raw);
    if (!r.success) throw new Error(`tools/${file}: ${r.error.message}`);
    return r.data;
  });
  return _tools;
}

export function loadEvents(): Event[] {
  if (_events) return _events;
  _events = loadJsonDir("events", (raw, file) => {
    const r = eventSchema.safeParse(raw);
    if (!r.success) throw new Error(`events/${file}: ${r.error.message}`);
    return r.data;
  }).sort((a, b) => b.date.localeCompare(a.date));
  return _events;
}

export function eventsForEntity(id: string): Event[] {
  return loadEvents().filter((e) => e.entity === id);
}

export function entityById(id: string): Model | Tool | undefined {
  return loadModels().find((m) => m.id === id) ?? loadTools().find((t) => t.id === id);
}
