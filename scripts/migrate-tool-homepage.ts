// One-shot migration: ensure every tool's links.homepage is populated from
// the legacy top-level tool.homepage, then strip the top-level field.
// Idempotent — safe to re-run.
//
// Run: npx tsx scripts/migrate-tool-homepage.ts [--dry-run]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TOOLS_DIR = join(ROOT, "data", "tools");
const dryRun = process.argv.includes("--dry-run");

let migrated = 0;
let unchanged = 0;
let conflicts: string[] = [];

for (const f of readdirSync(TOOLS_DIR)) {
  if (!f.endsWith(".json")) continue;
  const path = join(TOOLS_DIR, f);
  const obj = JSON.parse(readFileSync(path, "utf8"));
  const top = obj.homepage;
  const links = obj.links ?? (obj.links = {});

  let changed = false;
  if (top) {
    if (links.homepage && links.homepage !== top) {
      conflicts.push(`${f}: top=${top} vs links.homepage=${links.homepage}`);
    } else if (!links.homepage) {
      links.homepage = top;
    }
    delete obj.homepage;
    changed = true;
  } else if ("homepage" in obj) {
    delete obj.homepage;
    changed = true;
  }

  if (!changed) {
    unchanged++;
    continue;
  }
  if (dryRun) {
    console.log(`  WOULD migrate: ${f}`);
  } else {
    writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  }
  migrated++;
}

console.log(`\nmigrate-tool-homepage ${dryRun ? "(dry-run)" : ""}`);
console.log(`  ${dryRun ? "would migrate" : "migrated"}: ${migrated}`);
console.log(`  unchanged: ${unchanged}`);
if (conflicts.length) {
  console.log(`  CONFLICTS (review):`);
  for (const c of conflicts) console.log(`    - ${c}`);
}
