import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { eventSchema, modelSchema, toolSchema } from "../schemas/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const D = (sub: string) => join(ROOT, "data", sub);

function loadJson(dir: string) {
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); }
  catch { return [] as { file: string; data: unknown }[]; }
  return files.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }));
}

let errors = 0;
const fail = (msg: string) => { console.error(`✗ ${msg}`); errors++; };

const models = loadJson(D("models")).map(({ file, data }) => {
  const r = modelSchema.safeParse(data);
  if (!r.success) { fail(`models/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const tools = loadJson(D("tools")).map(({ file, data }) => {
  const r = toolSchema.safeParse(data);
  if (!r.success) { fail(`tools/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const events = loadJson(D("events")).map(({ file, data }) => {
  const r = eventSchema.safeParse(data);
  if (!r.success) { fail(`events/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const ids = new Set<string>([...models.map((m) => m.id), ...tools.map((t) => t.id)]);

for (const e of events) {
  if (!ids.has(e.entity)) fail(`events/${e.file}: entity ${e.entity} not found`);
}

const seen = new Map<string, string>();
for (const m of models) {
  if (seen.has(m.id)) fail(`models/${m.file}: duplicate id ${m.id} (also in ${seen.get(m.id)})`);
  seen.set(m.id, m.file);
}
for (const t of tools) {
  if (seen.has(t.id)) fail(`tools/${t.file}: duplicate id ${t.id} (also in ${seen.get(t.id)})`);
  seen.set(t.id, t.file);
}

if (errors > 0) {
  console.error(`\n${errors} reference error(s).`);
  process.exit(1);
}
console.log(`✓ verify-refs: ${models.length} models, ${tools.length} tools, ${events.length} events, all references resolve.`);
