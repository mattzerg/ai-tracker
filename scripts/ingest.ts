import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEvents, loadModels, loadTools } from "../src/lib/data.ts";
import { diffEvents, diffModels, diffTools } from "./ingest/diff.ts";
import { mergeModel, mergeTool } from "./ingest/merge.ts";
import { writeDiff } from "./ingest/writer.ts";
import { alibabaQwenModels } from "./ingest/sources/alibaba-qwen-models.ts";
import { anthropicChangelog } from "./ingest/sources/anthropic-changelog.ts";
import { cohereModels } from "./ingest/sources/cohere-models.ts";
import { deepseekModels } from "./ingest/sources/deepseek-models.ts";
import { geminiChangelog } from "./ingest/sources/gemini-changelog.ts";
import { githubTrending } from "./ingest/sources/github-trending.ts";
import { metaLlamaModels } from "./ingest/sources/meta-llama-models.ts";
import { mistralModels } from "./ingest/sources/mistral-models.ts";
import { openaiModels } from "./ingest/sources/openai-models.ts";
import { openrouter } from "./ingest/sources/openrouter.ts";
import { xaiModels } from "./ingest/sources/xai-models.ts";
import type { Event, Model, Tool } from "../schemas/index.ts";
import type { Source, SourceContext, SourceTrust } from "./ingest/types.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TMP = join(ROOT, "tmp");

// Authoritative sources run FIRST so their data lands before supplementary aggregators
// have a chance to overwrite. Each source dedupes within itself; first-write-wins across.
const SOURCES: Source[] = [
  anthropicChangelog,
  geminiChangelog,
  xaiModels,
  mistralModels,
  openaiModels,
  deepseekModels,
  metaLlamaModels,
  alibabaQwenModels,
  cohereModels,
  openrouter,
  githubTrending,
];

const MAX_USD = Number(process.env.MAX_INGEST_USD ?? 2);

function arg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = arg("apply");
  const updatesOnly = arg("updates-only");
  const writeStaging = arg("write-staging") || (!apply && arg("dry-run"));
  const dryRun = !apply;
  const writeReport = true;

  const applyLabel = updatesOnly ? "APPLY (updates only — supplementary new entries skipped)" : "APPLY (writes data/)";
  const mode = apply ? applyLabel : writeStaging ? "staging (writes tmp/proposed/)" : "dry-run (report only)";
  const ctx: SourceContext = { now: new Date(), dryRun };
  console.log(`ai-tracker ingest — ${ctx.now.toISOString()} — ${mode}`);
  console.log(`sources: ${SOURCES.map((s) => s.id).join(", ")}`);
  console.log(`cost cap: $${MAX_USD.toFixed(2)}\n`);

  const proposed: { models: { entry: Model; trust: SourceTrust }[]; tools: { entry: Tool; trust: SourceTrust }[]; events: Event[] } = { models: [], tools: [], events: [] };
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
    console.log(`  ${src.id} [${src.trust}]: ${m} models, ${t} tools, ${e} events, $${cost.toFixed(4)} (${ms} ms)`);
    if (result.models) for (const entry of result.models) proposed.models.push({ entry, trust: src.trust });
    if (result.tools) for (const entry of result.tools) proposed.tools.push({ entry, trust: src.trust });
    if (result.events) proposed.events.push(...result.events);
    if (result.warnings) for (const w of result.warnings) allWarnings.push({ source: src.id, warning: w });
    if (totalCost > MAX_USD) {
      console.warn(`  ! cost cap $${MAX_USD} exceeded, halting subsequent sources`);
      break;
    }
  }

  const currentModels = loadModels();
  const currentTools = loadTools();
  const currentEvents = loadEvents();
  const currentModelById = new Map(currentModels.map((m) => [m.id, m]));
  const currentToolById = new Map(currentTools.map((t) => [t.id, t]));

  // Merge each proposed entry against existing (so phantom diffs from supplementary sources collapse).
  const mergedModels: Model[] = [];
  const seenModelIds = new Set<string>();
  for (const { entry, trust } of proposed.models) {
    if (seenModelIds.has(entry.id)) continue;
    seenModelIds.add(entry.id);
    const existing = currentModelById.get(entry.id);
    mergedModels.push(existing ? mergeModel(existing, entry, { trust }) : entry);
  }
  const mergedTools: Tool[] = [];
  const seenToolIds = new Set<string>();
  for (const { entry, trust } of proposed.tools) {
    if (seenToolIds.has(entry.id)) continue;
    seenToolIds.add(entry.id);
    const existing = currentToolById.get(entry.id);
    mergedTools.push(existing ? mergeTool(existing, entry, { trust }) : entry);
  }

  const modelDiff = diffModels(currentModels, mergedModels);
  const toolDiff = diffTools(currentTools, mergedTools);

  // Synthesize price_change events from any updated model whose pricing
  // shifted by a non-noise amount. Filter mirrors generate-pricing-events.ts.
  // Source attribution: the merged model's first authoritative-looking source.
  const PRICE_FIELDS = ["input_per_mtok", "output_per_mtok"] as const;
  const mergedById = new Map(mergedModels.map((m) => [m.id, m]));
  const synthesizedEvents: Event[] = [];
  for (const u of modelDiff.updated) {
    if (!u.fields.includes("pricing")) continue;
    const fromP = (u.from.pricing ?? null) as Model["pricing"] | null;
    const toP = (u.to.pricing ?? null) as Model["pricing"] | null;
    if (!fromP || !toP) continue;
    const merged = mergedById.get(u.id);
    if (!merged) continue;
    const date = toP.as_of ?? "";
    if (!date) continue;
    const source = merged.sources.find((s) => !s.includes("openrouter.ai") && s.startsWith("http")) ?? merged.sources[0];
    if (!source) continue;
    for (const field of PRICE_FIELDS) {
      const a = fromP[field];
      const b = toP[field];
      if (typeof a !== "number" || typeof b !== "number") continue;
      if (a === b) continue;
      const absDelta = Math.abs(a - b);
      if (absDelta < 0.01 && Math.abs(absDelta / a) < 0.01) continue;
      const direction = b > a ? "increased" : "decreased";
      const pct = Math.abs(((b - a) / a) * 100).toFixed(0);
      const tag = field === "input_per_mtok" ? "Input" : "Output";
      synthesizedEvents.push({
        date,
        entity: u.id,
        type: "price_change",
        summary: `${merged.name}: ${tag} price ${direction} from $${a}/M to $${b}/M (${pct}% change).`,
        delta: { field: `pricing.${field}`, from: a, to: b },
        source,
        submitted_by: "ingest-bot",
      });
    }
  }
  const allEvents = [...proposed.events, ...synthesizedEvents];
  if (synthesizedEvents.length) {
    console.log(`  ingest-events [synthesized]: ${synthesizedEvents.length} price_change events from pricing diffs`);
  }
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

  if (writeStaging || apply) {
    const target = apply
      ? { dataRoot: join(ROOT, "data"), updatesOnly }
      : { dataRoot: join(TMP, "proposed"), fresh: true };
    const result = writeDiff(modelDiff, toolDiff, eventDiff, mergedModels, mergedTools, target);
    const skipped = apply && updatesOnly
      ? ` (skipped ${modelDiff.added.length} new models, ${toolDiff.added.length} new tools — review-required)`
      : "";
    console.log(
      `\nwrote ${result.paths.length} files to ${target.dataRoot}: +${result.modelsAdded}/${result.toolsAdded}/${result.eventsAdded} new, ~${result.modelsUpdated}/${result.toolsUpdated} updated${skipped}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
