import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { eventSchema, modelSchema, repoCandidateQueueSchema, repoSchema, toolSchema } from "../schemas/index.ts";

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

const repos = loadJson(D("repos")).map(({ file, data }) => {
  const r = repoSchema.safeParse(data);
  if (!r.success) { fail(`repos/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const repoCandidateQueues = loadJson(D("repo-candidates")).map(({ file, data }) => {
  const r = repoCandidateQueueSchema.safeParse(data);
  if (!r.success) { fail(`repo-candidates/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const events = loadJson(D("events")).map(({ file, data }) => {
  const r = eventSchema.safeParse(data);
  if (!r.success) { fail(`events/${file}: ${r.error.message}`); return null; }
  return { file, ...r.data };
}).filter((x): x is NonNullable<typeof x> => x != null);

const ids = new Set<string>([...models.map((m) => m.id), ...tools.map((t) => t.id), ...repos.map((r) => r.id)]);

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
for (const r of repos) {
  if (seen.has(r.id)) fail(`repos/${r.file}: duplicate id ${r.id} (also in ${seen.get(r.id)})`);
  seen.set(r.id, r.file);
}

const seenCandidates = new Map<string, string>();
for (const q of repoCandidateQueues) {
  for (const candidate of q.candidates) {
    if (seen.has(candidate.id)) {
      fail(`repo-candidates/${q.file}: candidate ${candidate.id} is already tracked in ${seen.get(candidate.id)}; remove it from data/repo-candidates/${q.file}`);
    }
    if (seenCandidates.has(candidate.id)) {
      fail(`repo-candidates/${q.file}: duplicate candidate id ${candidate.id} (also in ${seenCandidates.get(candidate.id)})`);
    }
    seenCandidates.set(candidate.id, q.file);
  }
}

// Every entity with a release date must have a `released` event matching that
// date. Catches drift between model.released and the events log — easy to
// introduce when adding a model by hand without running events:backfill-releases.
const releaseEventKeys = new Set(
  events.filter((e) => e.type === "released").map((e) => `${e.entity}__${e.date}`),
);
for (const m of models) {
  if (!m.released) continue;
  if (!releaseEventKeys.has(`${m.id}__${m.released}`)) {
    fail(`models/${m.file}: released ${m.released} but no matching released event (run pnpm events:backfill-releases)`);
  }
}
for (const t of tools) {
  if (!t.released) continue;
  if (!releaseEventKeys.has(`${t.id}__${t.released}`)) {
    fail(`tools/${t.file}: released ${t.released} but no matching released event (run pnpm events:backfill-releases)`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} reference error(s).`);
  process.exit(1);
}
const repoCandidateCount = repoCandidateQueues.reduce((sum, q) => sum + q.candidates.length, 0);
console.log(`✓ verify-refs: ${models.length} models, ${tools.length} tools, ${repos.length} repos, ${repoCandidateCount} repo candidates, ${events.length} events, all references resolve.`);
