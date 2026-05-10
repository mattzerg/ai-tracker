import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEvents, loadModels, loadTools } from "../src/lib/data.ts";
import { diffEvents, diffModels, diffTools } from "./ingest/diff.ts";
import { openrouter } from "./ingest/sources/openrouter.ts";
import type { Event, Model, Tool } from "../schemas/index.ts";
import type { Source, SourceContext } from "./ingest/types.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TMP = join(ROOT, "tmp");

const SOURCES: Source[] = [openrouter];

const MAX_USD = Number(process.env.MAX_INGEST_USD ?? 2);

function arg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = arg("dry-run");
  const writeReport = arg("write-report") || dryRun;

  const ctx: SourceContext = { now: new Date(), dryRun };
  console.log(`ai-tracker ingest — ${ctx.now.toISOString()} ${dryRun ? "(dry-run)" : ""}`);
  console.log(`sources: ${SOURCES.map((s) => s.id).join(", ")}`);
  console.log(`cost cap: $${MAX_USD.toFixed(2)}\n`);

  const allModels: Model[] = [];
  const allTools: Tool[] = [];
  const allEvents: Event[] = [];
  const allWarnings: { source: string; warning: string }[] = [];
  let totalCost = 0;

  for (const src of SOURCES) {
    const t0 = Date.now();
    const result = await src.run(ctx);
    const ms = Date.now() - t0;
    const m = result.models?.length ?? 0;
    const t = result.tools?.length ?? 0;
    const e = result.events?.length ?? 0;
    const cost = result.estimatedCostUsd ?? 0;
    totalCost += cost;
    console.log(`  ${src.id}: ${m} models, ${t} tools, ${e} events, $${cost.toFixed(4)} (${ms} ms)`);
    if (result.models) allModels.push(...result.models);
    if (result.tools) allTools.push(...result.tools);
    if (result.events) allEvents.push(...result.events);
    if (result.warnings) for (const w of result.warnings) allWarnings.push({ source: src.id, warning: w });
    if (totalCost > MAX_USD) {
      console.warn(`  ! cost cap $${MAX_USD} exceeded, halting subsequent sources`);
      break;
    }
  }

  const currentModels = loadModels();
  const currentTools = loadTools();
  const currentEvents = loadEvents();

  const modelDiff = diffModels(currentModels, allModels);
  const toolDiff = diffTools(currentTools, allTools);
  const eventDiff = diffEvents(currentEvents, allEvents);

  console.log("\n--- diff summary ---");
  console.log(`Models   : +${modelDiff.added.length} new, ~${modelDiff.updated.length} updated, ${modelDiff.unchanged} unchanged`);
  console.log(`Tools    : +${toolDiff.added.length} new, ~${toolDiff.updated.length} updated, ${toolDiff.unchanged} unchanged`);
  console.log(`Events   : +${eventDiff.added.length} new`);
  console.log(`Warnings : ${allWarnings.length}`);
  console.log(`Cost     : $${totalCost.toFixed(4)} of $${MAX_USD.toFixed(2)} cap`);

  if (writeReport) {
    mkdirSync(TMP, { recursive: true });
    const path = join(TMP, "ingest-report.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          generated_at: ctx.now.toISOString(),
          sources_run: SOURCES.map((s) => s.id),
          totals: {
            models: { added: modelDiff.added.length, updated: modelDiff.updated.length, unchanged: modelDiff.unchanged },
            tools: { added: toolDiff.added.length, updated: toolDiff.updated.length, unchanged: toolDiff.unchanged },
            events: { added: eventDiff.added.length },
          },
          model_diff: modelDiff,
          tool_diff: toolDiff,
          event_diff: eventDiff,
          warnings: allWarnings,
          estimated_cost_usd: totalCost,
        },
        null,
        2,
      ),
    );
    console.log(`\nreport: ${path}`);
  }

  if (!dryRun) {
    console.error("\nNon-dry-run materialization is not implemented yet (Phase 3 step 2). Use --dry-run to preview.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
