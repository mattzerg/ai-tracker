// Build-output smoke test — validates that `astro build` produced a healthy site.
//
// Runs against dist/ (no server needed, CI-friendly). Asserts:
//   - every critical page route emitted an .html file
//   - every agent endpoint (JSON/txt/xml) emitted valid, non-empty, well-shaped output
//   - a sampled entity has its full twin set (html + json + md + og png)
//   - no rendered page leaks an obvious error fragment
//
// Usage: pnpm run smoke   (= astro build && tsx scripts/smoke.ts)
//        tsx scripts/smoke.ts   (validate an existing dist/)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(import.meta.dirname, "..", "dist");
const failures: string[] = [];
const checks = { passed: 0, failed: 0 };

function ok(_label: string) {
  checks.passed++;
}
function fail(label: string, detail: string) {
  checks.failed++;
  failures.push(`${label}: ${detail}`);
}

function fileExists(rel: string): boolean {
  return existsSync(join(DIST, rel)) && statSync(join(DIST, rel)).isFile();
}

function readDist(rel: string): string | null {
  try {
    return readFileSync(join(DIST, rel), "utf8");
  } catch {
    return null;
  }
}

function checkHtml(rel: string) {
  const body = readDist(rel);
  if (!body) return fail(`page ${rel}`, "missing");
  if (body.length < 500) return fail(`page ${rel}`, `suspiciously small (${body.length}b)`);
  // Astro error pages / unrendered template markers
  if (/Cannot read propert|undefined is not|astro-island.*error|Internal Server Error/i.test(body)) {
    return fail(`page ${rel}`, "contains error fragment");
  }
  ok(`page ${rel}`);
}

function checkJson(rel: string, requiredKeys: string[], opts: { nonEmptyArrayKey?: string } = {}) {
  const body = readDist(rel);
  if (!body) return fail(`json ${rel}`, "missing");
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return fail(`json ${rel}`, `invalid JSON: ${(e as Error).message}`);
  }
  for (const k of requiredKeys) {
    if (!(k in parsed)) return fail(`json ${rel}`, `missing key '${k}'`);
  }
  if (opts.nonEmptyArrayKey) {
    const arr = parsed[opts.nonEmptyArrayKey];
    if (!Array.isArray(arr) || arr.length === 0) {
      return fail(`json ${rel}`, `'${opts.nonEmptyArrayKey}' empty or not an array`);
    }
  }
  ok(`json ${rel}`);
}

function checkText(rel: string, mustContain: string[]) {
  const body = readDist(rel);
  if (!body) return fail(`text ${rel}`, "missing");
  if (body.trim().length === 0) return fail(`text ${rel}`, "empty");
  for (const needle of mustContain) {
    if (!body.includes(needle)) return fail(`text ${rel}`, `missing marker '${needle}'`);
  }
  ok(`text ${rel}`);
}

// ---- 1. dist/ must exist -----------------------------------------------------
if (!existsSync(DIST)) {
  console.error("smoke: dist/ not found — run `astro build` first (or `pnpm run smoke`).");
  process.exit(2);
}

// ---- 2. critical page routes (site builds format:'file' → flat .html) --------
for (const rel of [
  "index.html",
  "models.html",
  "tools.html",
  "repos.html",
  "changes.html",
  "compare.html",
  "explorer.html",
  "picker.html",
  "leaderboards.html",
  "concord.html",
  "search.html",
  "about.html",
  "submit.html",
]) {
  checkHtml(rel);
}

// ---- 3. agent endpoints (the product's reason for existing) ------------------
checkJson("api/search.json", ["generated_at", "models", "tools", "repos", "events"], { nonEmptyArrayKey: "models" });
checkJson("dump/all.json", ["generated_at"], {});
checkJson("dump/events-30d.json", ["generated_at"], {});
checkJson("changes.json", ["generated_at"], {});
checkJson("leaderboards.json", ["generated_at"], {});
checkJson("concord.json", ["generated_at"], {});
checkJson("influencers.json", ["generated_at"], {});
checkText("llms.txt", ["ai-tracker", "models"]);
checkText("llms-full.txt", ["ai-tracker"]);
checkText("robots.txt", ["User-agent"]);
checkText("feed.xml", ["<rss", "<item"]);   // feed.xml is RSS 2.0
checkText("atom.xml", ["<feed", "<entry"]); // atom.xml is the Atom feed
checkText("sitemap-agents.xml", ["<urlset", "<url>"]);

// ---- 4. entity twin completeness (sample first model/tool/repo) --------------
function firstId(dir: string): string | null {
  try {
    // Entity twins are provider-prefixed (anthropic__…, github__…); skip
    // aggregate files like index.json / candidates.json.
    const f = readdirSync(join(DIST, dir)).find(
      (x) => x.endsWith(".json") && x.includes("__"),
    );
    return f ? f.replace(/\.json$/, "") : null;
  } catch {
    return null;
  }
}
const m = firstId("models");
if (m) {
  checkHtml(`models/${m}.html`);
  checkJson(`models/${m}.json`, ["id", "name", "provider"], {});
  if (!fileExists(`models/${m}.md`)) fail(`twin models/${m}.md`, "missing markdown twin");
  else ok(`twin models/${m}.md`);
  if (!fileExists(`og/models/${m}.png`)) fail(`og models/${m}.png`, "missing OG card");
  else ok(`og models/${m}.png`);
} else {
  fail("entity sample", "no model JSON twins found in dist/models");
}
const r = firstId("repos");
if (r) checkJson(`repos/${r}.json`, ["id", "full_name"], {});
// candidates queue is a different shape (not an entity record)
checkJson("repos/candidates.json", ["kind", "generated_at", "candidates"], { nonEmptyArrayKey: "candidates" });

// ---- report ------------------------------------------------------------------
console.log(`\nsmoke: ${checks.passed} passed, ${checks.failed} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("✓ build output healthy — pages render, agent endpoints valid, twins complete.");
