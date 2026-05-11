// Sweep stale PNGs from tmp/png-cache/. Cache is keyed by content-hash and
// never invalidated on its own; this prevents long-term disk creep.
//
// Default: delete entries older than 30 days. Override with --days=N.
// --dry-run shows what would go without touching disk.

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, "tmp", "png-cache");
const dryRun = process.argv.includes("--dry-run");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const MAX_AGE_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 30;
const MAX_AGE_MS = MAX_AGE_DAYS * 86400 * 1000;

if (!existsSync(CACHE_DIR)) {
  console.log(`png-cache-sweep: ${CACHE_DIR} doesn't exist — nothing to do.`);
  process.exit(0);
}

const now = Date.now();
const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".png"));

let deleted = 0;
let kept = 0;
let bytesFreed = 0;

for (const f of files) {
  const path = join(CACHE_DIR, f);
  const st = statSync(path);
  const age = now - st.mtimeMs;
  if (age > MAX_AGE_MS) {
    if (dryRun) {
      console.log(`  WOULD delete ${f} (${(age / 86400000).toFixed(0)}d old, ${(st.size / 1024).toFixed(1)}KB)`);
    } else {
      unlinkSync(path);
    }
    deleted++;
    bytesFreed += st.size;
  } else {
    kept++;
  }
}

console.log(`\npng-cache-sweep ${dryRun ? "(dry-run)" : ""}`);
console.log(`  cache dir: ${CACHE_DIR}`);
console.log(`  threshold: ${MAX_AGE_DAYS} days`);
console.log(`  ${dryRun ? "would delete" : "deleted"}: ${deleted}`);
console.log(`  kept: ${kept}`);
console.log(`  ${dryRun ? "would free" : "freed"}: ${(bytesFreed / 1024 / 1024).toFixed(2)} MB`);
