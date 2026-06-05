// One-shot: backfill `released` events for every model that has a release date
// but no event-of-type-released yet. Idempotent — skips dupes by (date, entity, type).
// Run: npx tsx scripts/generate-release-events.ts [--dry-run]

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEvents, loadModels, loadRepos, loadTools } from "../src/lib/data.ts";

const ROOT = resolve(import.meta.dirname, "..");
const EVENTS_DIR = join(ROOT, "data", "events");
const dryRun = process.argv.includes("--dry-run");

function summaryFor(name: string, provider: string, contextWindow: number | null | undefined): string {
  const ctx = contextWindow ? ` ${contextWindow.toLocaleString()}-token context.` : "";
  return `${name} released by ${provider}.${ctx}`.trim();
}

function toolSummary(name: string, vendor: string, category: string): string {
  return `${name} released by ${vendor} (${category}).`;
}

function repoSummary(fullName: string, category: string, language: string | null): string {
  const lang = language ? `, ${language}` : "";
  return `${fullName} first published on GitHub (${category}${lang}).`;
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
  const tools = loadTools();
  const repos = loadRepos();
  const events = loadEvents();
  const existingKeys = new Set(events.map((e) => `${e.date}__${e.entity}__${e.type}`));

  let written = 0;
  let skipped = 0;
  let skippedNoRelease = 0;
  let skippedNoSource = 0;

  if (!dryRun) mkdirSync(EVENTS_DIR, { recursive: true });

  type Releasable = { id: string; released: string | null; sources: string[]; summary: string };
  const items: Releasable[] = [
    ...models.map((m) => ({
      id: m.id,
      released: m.released ?? null,
      sources: m.sources,
      summary: summaryFor(m.name, m.provider, m.context_window),
    })),
    ...tools.map((t) => ({
      id: t.id,
      released: t.released ?? null,
      sources: t.sources,
      summary: toolSummary(t.name, t.vendor, t.category),
    })),
    ...repos.map((r) => ({
      id: r.id,
      released: r.created_at ?? null,
      sources: r.sources,
      summary: repoSummary(r.full_name, r.category, r.language),
    })),
  ];

  for (const it of items) {
    if (!it.released) {
      skippedNoRelease++;
      continue;
    }
    const key = `${it.released}__${it.id}__released`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const source = sourceFor({ sources: it.sources });
    if (!source) {
      skippedNoSource++;
      console.warn(`  skip (no source): ${it.id}`);
      continue;
    }
    const event = {
      date: it.released,
      entity: it.id,
      type: "released" as const,
      summary: it.summary,
      source,
      submitted_by: "ingest-bot" as const,
    };
    const path = join(EVENTS_DIR, `${it.released}__${it.id}__released.json`);
    if (dryRun) {
      console.log(`  WOULD write: ${path}`);
    } else {
      if (existsSync(path)) {
        skipped++;
        continue;
      }
      writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`);
    }
    written++;
  }

  console.log(`\ngenerate-release-events ${dryRun ? "(dry-run)" : ""}`);
  console.log(`  models: ${models.length} · tools: ${tools.length} · repos: ${repos.length}`);
  console.log(`  ${dryRun ? "would write" : "wrote"}: ${written}`);
  console.log(`  skipped (already had event): ${skipped}`);
  console.log(`  skipped (no released date): ${skippedNoRelease}`);
  console.log(`  skipped (no source URL): ${skippedNoSource}`);
}

main();
