// One-shot: backfill `released` events for every model that has a release date
// but no event-of-type-released yet. Idempotent — skips dupes by (date, entity, type).
// Run: npx tsx scripts/generate-release-events.ts [--dry-run]

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEvents, loadModels } from "../src/lib/data.ts";

const ROOT = resolve(import.meta.dirname, "..");
const EVENTS_DIR = join(ROOT, "data", "events");
const dryRun = process.argv.includes("--dry-run");

function summaryFor(name: string, provider: string, contextWindow: number | null | undefined): string {
  const ctx = contextWindow ? ` ${contextWindow.toLocaleString()}-token context.` : "";
  return `${name} released by ${provider}.${ctx}`.trim();
}

function sourceFor(model: { sources: string[] }): string {
  // Prefer first authoritative-looking URL: provider docs, blog, or homepage.
  const auth = model.sources.find(
    (s) => !s.includes("openrouter.ai") && !s.includes("huggingface.co") && s.startsWith("http"),
  );
  return auth ?? model.sources[0];
}

function main() {
  const models = loadModels();
  const events = loadEvents();
  const existingKeys = new Set(events.map((e) => `${e.date}__${e.entity}__${e.type}`));

  let written = 0;
  let skipped = 0;
  let skippedNoRelease = 0;
  let skippedNoSource = 0;

  if (!dryRun) mkdirSync(EVENTS_DIR, { recursive: true });

  for (const m of models) {
    if (!m.released) {
      skippedNoRelease++;
      continue;
    }
    const key = `${m.released}__${m.id}__released`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const source = sourceFor(m);
    if (!source) {
      skippedNoSource++;
      console.warn(`  skip (no source): ${m.id}`);
      continue;
    }
    const event = {
      date: m.released,
      entity: m.id,
      type: "released" as const,
      summary: summaryFor(m.name, m.provider, m.context_window),
      source,
      submitted_by: "ingest-bot" as const,
    };
    const path = join(EVENTS_DIR, `${m.released}__${m.id}__released.json`);
    if (dryRun) {
      console.log(`  WOULD write: ${path}`);
    } else {
      if (existsSync(path)) {
        // Different (date,entity,type) hash equals same key — shouldn't happen, but be safe.
        skipped++;
        continue;
      }
      writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`);
    }
    written++;
  }

  console.log(`\ngenerate-release-events ${dryRun ? "(dry-run)" : ""}`);
  console.log(`  models: ${models.length}`);
  console.log(`  ${dryRun ? "would write" : "wrote"}: ${written}`);
  console.log(`  skipped (already had event): ${skipped}`);
  console.log(`  skipped (no released date): ${skippedNoRelease}`);
  console.log(`  skipped (no source URL): ${skippedNoSource}`);
}

main();
