// Walk each model file's git history, emit price_change events for any
// numeric pricing transition (input or output, both directions). Idempotent —
// skips events whose (date, entity, type, field) tuple already exists on disk.
//
// Run: npm run events:backfill-pricing [--dry-run]

import { execSync } from "node:child_process";
import { writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MODELS_DIR = join(ROOT, "data", "models");
const EVENTS_DIR = join(ROOT, "data", "events");
const dryRun = process.argv.includes("--dry-run");

interface PricingShape {
  input_per_mtok?: number | null;
  output_per_mtok?: number | null;
  as_of?: string;
}
interface ModelShape {
  id: string;
  name: string;
  pricing?: PricingShape | null;
  sources?: string[];
}

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function commitsFor(relPath: string): string[] {
  // Oldest → newest order so consecutive pairs are forward-in-time.
  const out = git(`log --follow --reverse --format=%H -- ${relPath}`);
  return out ? out.split("\n").filter(Boolean) : [];
}

function readAt(commit: string, relPath: string): ModelShape | null {
  try {
    const raw = git(`show ${commit}:${relPath}`);
    return JSON.parse(raw) as ModelShape;
  } catch {
    return null;
  }
}

function preferredSource(m: ModelShape): string | null {
  const ss = m.sources ?? [];
  const auth = ss.find((s) => !s.includes("openrouter.ai") && s.startsWith("http"));
  return auth ?? ss[0] ?? null;
}

interface ProposedEvent {
  date: string;
  entity: string;
  field: "pricing.input_per_mtok" | "pricing.output_per_mtok";
  from: number;
  to: number;
  source: string;
  entityName: string;
}

function existingKeys(): Set<string> {
  if (!existsSync(EVENTS_DIR)) return new Set();
  const keys = new Set<string>();
  for (const f of readdirSync(EVENTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const e = JSON.parse(readFileSync(join(EVENTS_DIR, f), "utf8"));
      if (e.type !== "price_change") continue;
      const fld = e.delta?.field ?? "";
      keys.add(`${e.date}__${e.entity}__price_change__${fld}`);
    } catch {
      /* skip */
    }
  }
  return keys;
}

function fmtDelta(field: string, from: number, to: number): string {
  const direction = to > from ? "increased" : "decreased";
  const pct = Math.abs(((to - from) / from) * 100);
  const tag = field === "pricing.input_per_mtok" ? "Input" : "Output";
  return `${tag} price ${direction} from $${from}/M to $${to}/M (${pct.toFixed(0)}% change).`;
}

function main() {
  const proposed: ProposedEvent[] = [];
  const seenKeys = existingKeys();

  for (const f of readdirSync(MODELS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const relPath = `data/models/${f}`;
    const commits = commitsFor(relPath);
    if (commits.length < 2) continue;

    let prev: ModelShape | null = null;
    let prevCommit: string | null = null;
    for (const commit of commits) {
      const curr = readAt(commit, relPath);
      if (!curr) continue;
      if (prev && prev.pricing && curr.pricing) {
        const prevP = prev.pricing;
        const currP = curr.pricing;
        for (const field of ["input_per_mtok", "output_per_mtok"] as const) {
          const fromV = prevP[field];
          const toV = currP[field];
          if (typeof fromV !== "number" || typeof toV !== "number") continue;
          if (fromV === toV) continue;
          // Skip near-identical floating-point noise (< 1% drift, < $0.01 absolute).
          const absDelta = Math.abs(fromV - toV);
          if (absDelta < 0.01 && Math.abs(absDelta / fromV) < 0.01) continue;
          const date = currP.as_of ?? "";
          if (!date) continue;
          proposed.push({
            date,
            entity: curr.id,
            field: `pricing.${field}` as ProposedEvent["field"],
            from: fromV,
            to: toV,
            source: preferredSource(curr) ?? "",
            entityName: curr.name,
          });
        }
      }
      prev = curr;
      prevCommit = commit;
    }
  }

  if (!dryRun) mkdirSync(EVENTS_DIR, { recursive: true });

  let written = 0;
  let skippedDupe = 0;
  let skippedNoSource = 0;
  for (const p of proposed) {
    const key = `${p.date}__${p.entity}__price_change__${p.field}`;
    if (seenKeys.has(key)) {
      skippedDupe++;
      continue;
    }
    if (!p.source) {
      skippedNoSource++;
      continue;
    }
    seenKeys.add(key);
    const event = {
      date: p.date,
      entity: p.entity,
      type: "price_change" as const,
      summary: `${p.entityName}: ${fmtDelta(p.field, p.from, p.to)}`,
      delta: { field: p.field, from: p.from, to: p.to },
      source: p.source,
      submitted_by: "ingest-bot" as const,
    };
    const fname = `${p.date}__${p.entity}__price_change__${p.field.replace(".", "_")}.json`;
    const path = join(EVENTS_DIR, fname);
    if (dryRun) {
      console.log(`  WOULD write ${fname}`);
      console.log(`    ${event.summary}`);
    } else {
      writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`);
    }
    written++;
  }

  console.log(`\ngenerate-pricing-events ${dryRun ? "(dry-run)" : ""}`);
  console.log(`  proposed: ${proposed.length}`);
  console.log(`  ${dryRun ? "would write" : "wrote"}: ${written}`);
  console.log(`  skipped (dupe): ${skippedDupe}`);
  console.log(`  skipped (no source): ${skippedNoSource}`);
}

main();
