// Data-quality linter — semantic sanity beyond schema (verify:refs) and source
// reachability (verify:sources). Catches data that would make MEASUREMENTS
// misleading: implausible benchmark values, stale/absent pricing dates, GA
// models missing release dates, status/tag inconsistencies. Reports coverage
// (informational) and fails on hard errors.
//
// Usage: pnpm run verify:quality

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "..", "data");
const TODAY = new Date();
let errors = 0;
let warns = 0;
const fail = (m: string) => { console.error(`✗ ${m}`); errors++; };
const warn = (m: string) => { console.warn(`⚠ ${m}`); warns++; };

function loadDir(dir: string): Array<{ file: string; data: any }> {
  try {
    return readdirSync(join(DATA, dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(DATA, dir, f), "utf8")) }));
  } catch {
    return [];
  }
}

// Benchmarks that are integer scores (not 0–1 fractions). Everything else must be ≤1.
const INTEGER_BENCHMARKS = new Set(["arena_elo"]);
const VALID_STATUS = new Set(["preview", "ga", "deprecated", "retired"]);

const models = loadDir("models");
let withBench = 0;
const seenIds = new Map<string, string>();

for (const { file, data: m } of models) {
  const id = m.id ?? file;

  // duplicate id detection
  if (seenIds.has(m.id)) fail(`duplicate model id ${m.id} (${file} + ${seenIds.get(m.id)})`);
  else seenIds.set(m.id, file);

  // status sanity
  if (m.status && !VALID_STATUS.has(m.status)) fail(`${id}: invalid status '${m.status}'`);

  // GA models should have a release date (else timeline/recency is wrong)
  if (m.status === "ga" && !m.released) warn(`${id}: GA model missing 'released' date`);

  // pricing date sanity (drives the "as of" the picker/compare show)
  const asOf = m.pricing?.as_of;
  if (m.pricing && !asOf) fail(`${id}: pricing present but no 'as_of' date`);
  if (asOf) {
    const d = new Date(asOf);
    if (Number.isNaN(d.getTime())) fail(`${id}: unparseable pricing as_of '${asOf}'`);
    else {
      const ageDays = (TODAY.getTime() - d.getTime()) / 86400000;
      if (ageDays > 365) warn(`${id}: pricing as_of ${asOf} is ${Math.round(ageDays)}d old — verify`);
      if (ageDays < -2) fail(`${id}: pricing as_of ${asOf} is in the future`);
    }
  }
  // negative prices are impossible
  for (const k of ["input_per_mtok", "output_per_mtok"] as const) {
    const v = m.pricing?.[k];
    if (typeof v === "number" && v < 0) fail(`${id}: negative ${k} (${v})`);
  }

  // benchmark plausibility — the values that feed quality scoring
  const bm = m.benchmarks ?? {};
  if (Object.keys(bm).length) withBench++;
  for (const [k, v] of Object.entries(bm)) {
    if (typeof v !== "number" || Number.isNaN(v)) { fail(`${id}: benchmark ${k} not a number (${v})`); continue; }
    if (v < 0) fail(`${id}: negative benchmark ${k} (${v})`);
    if (!INTEGER_BENCHMARKS.has(k) && v > 1) {
      fail(`${id}: benchmark ${k}=${v} > 1 but isn't a known integer benchmark — fraction expected (0–1)`);
    }
    if (INTEGER_BENCHMARKS.has(k) && v > 0 && v <= 1) {
      warn(`${id}: ${k}=${v} looks like a fraction but ${k} is an integer score`);
    }
  }
}

// Coverage report (informational — never fails; backfill needs real research)
const gaModels = models.filter((m) => m.data.status === "ga");
const gaWithBench = gaModels.filter((m) => Object.keys(m.data.benchmarks ?? {}).length).length;
const pct = gaModels.length ? Math.round((gaWithBench / gaModels.length) * 100) : 0;

console.log(`\nverify:quality — ${models.length} models scanned`);
console.log(`  benchmark coverage: ${gaWithBench}/${gaModels.length} GA models (${pct}%)`);
console.log(`  ${errors} error(s), ${warns} warning(s)`);

if (errors > 0) {
  console.error(`\n${errors} data-quality error(s) — measurements would be misleading. Fix before ship.`);
  process.exit(1);
}
console.log("✓ data-quality checks passed (warnings are advisory).");
