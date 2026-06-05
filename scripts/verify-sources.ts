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
for (const dir of ["models", "tools", "repos", "events"]) {
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

const VERIFY_UA = "ai-tracker-verify/0.1 (+https://github.com/mattzerg/ai-tracker)";
// Realistic browser UA for the retry pass. Some hosts (e.g. milvus.io) reject a
// bot UA's HEAD at the network layer but serve a normal browser GET (302→200).
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function attempt(u: string, method: "HEAD" | "GET", ua: string, redirect: RequestRedirect = "follow") {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u, {
      method,
      redirect,
      signal: ac.signal,
      headers: { "user-agent": ua, accept: "*/*" },
    });
    return { status: res.status as number, error: undefined as string | undefined };
  } catch (err) {
    return { status: 0, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function check(u: string): Promise<{ url: string; ok: boolean; status: number; soft?: boolean; error?: string }> {
  const host = new URL(u).hostname.replace(/^www\./, "");
  const method = FORCE_GET_HOSTS.has(host) ? "GET" : "HEAD";

  // Pass 1: cheap HEAD (or GET for known HEAD-hostile hosts) with the verify UA.
  let r = await attempt(u, method, VERIFY_UA);
  if (r.status > 0 && r.status < 400) return { url: u, ok: true, status: r.status };
  if (SOFT_PASS_STATUS.has(r.status)) return { url: u, ok: true, status: r.status, soft: true };

  // Pass 2: a redirect-following GET with a real browser UA. Catches hosts that
  // reject bot HEADs at the network layer but serve normal browsers.
  r = await attempt(u, "GET", BROWSER_UA);
  if (r.status > 0 && r.status < 400) return { url: u, ok: true, status: r.status, soft: true };
  if (SOFT_PASS_STATUS.has(r.status)) return { url: u, ok: true, status: r.status, soft: true };

  // Pass 3: a NON-following probe. Some hosts (e.g. milvus.io) bounce bots
  // through a cookie/geo redirect loop that node's fetch can't resolve ("fetch
  // failed"). With redirect:"manual" we don't follow — any 3xx proves the server
  // is alive and actively responding, so soft-pass. A genuinely dead host
  // (DNS/conn failure) still returns no response here → real failure.
  const probe = await attempt(u, "GET", BROWSER_UA, "manual");
  if (probe.status >= 300 && probe.status < 400) return { url: u, ok: true, status: probe.status, soft: true };
  if (probe.status > 0 && probe.status < 400) return { url: u, ok: true, status: probe.status, soft: true };
  if (SOFT_PASS_STATUS.has(probe.status)) return { url: u, ok: true, status: probe.status, soft: true };
  return { url: u, ok: false, status: r.status, error: r.error };
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
