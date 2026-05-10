import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const D = (sub: string) => join(ROOT, "data", sub);

function* extractUrls(value: unknown): Generator<string> {
  if (typeof value === "string" && /^https?:\/\//.test(value)) yield value;
  else if (Array.isArray(value)) for (const v of value) yield* extractUrls(v);
  else if (value && typeof value === "object")
    for (const v of Object.values(value as Record<string, unknown>)) yield* extractUrls(v);
}

function loadJson(dir: string) {
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); }
  catch { return [] as { file: string; data: unknown }[]; }
  return files.map((f) => ({ file: `${dir.split("/").pop()}/${f}`, data: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }));
}

const urls = new Map<string, string[]>();
for (const dir of ["models", "tools", "events"]) {
  for (const { file, data } of loadJson(D(dir))) {
    for (const u of extractUrls(data)) {
      if (!urls.has(u)) urls.set(u, []);
      urls.get(u)!.push(file);
    }
  }
}

if (urls.size === 0) {
  console.log("✓ verify-sources: no URLs to check (empty data).");
  process.exit(0);
}

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 16;
const FORCE_GET_HOSTS = new Set(["x.com", "twitter.com", "github.com"]);

// 403 and 405 mean the URL exists but the server rejected our method or user-agent.
// These are common for big-co marketing sites and don't indicate a broken link.
const SOFT_PASS_STATUS = new Set([401, 403, 405, 429]);

async function check(u: string): Promise<{ url: string; ok: boolean; status: number; soft?: boolean; error?: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const host = new URL(u).hostname.replace(/^www\./, "");
    const method = FORCE_GET_HOSTS.has(host) ? "GET" : "HEAD";
    const res = await fetch(u, {
      method,
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": "ai-tracker-verify/0.1 (+https://github.com/mattzerg/ai-tracker)" },
    });
    if (res.status < 400) return { url: u, ok: true, status: res.status };
    if (SOFT_PASS_STATUS.has(res.status)) return { url: u, ok: true, status: res.status, soft: true };
    return { url: u, ok: false, status: res.status };
  } catch (err) {
    return { url: u, ok: false, status: 0, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

const queue = [...urls.keys()];
const results: Awaited<ReturnType<typeof check>>[] = [];
async function worker() {
  while (queue.length) {
    const u = queue.shift()!;
    results.push(await check(u));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const bad = results.filter((r) => !r.ok);
const soft = results.filter((r) => r.ok && r.soft);
for (const b of bad) {
  const where = urls.get(b.url)!.join(", ");
  console.error(`✗ ${b.status || "ERR"} ${b.url}  (in ${where})${b.error ? ` — ${b.error}` : ""}`);
}
for (const s of soft) {
  console.warn(`! ${s.status} ${s.url}  (soft-pass: server reachable, blocked our request)`);
}

if (bad.length > 0) {
  console.error(`\n${bad.length}/${results.length} URL(s) failed.`);
  process.exit(1);
}
const hardOk = results.length - soft.length;
console.log(`✓ verify-sources: ${results.length} URL(s) reachable (${hardOk} hard-200, ${soft.length} soft-pass).`);
