import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { signalsIndexSchema, type Model, type Repo, type Tool } from "../../../schemas/index.ts";
import { loadModels, loadRepos, loadTools } from "../../../src/lib/data.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

// Signals ingest source — attaches the reference/quality-signal summary to each
// tracked entity from the committed contract at data/signals/index.json.
//
// That contract is produced LOCALLY by the signal miners (scripts/signals/),
// which enforce the privacy split (only aggregate score + counts + public
// mentions land in the index; raw personal context stays in a local sqlite).
// This source just reads the public-safe index — so it is safe to run in CI.
// Supplementary trust; signals merge latest-wins (see merge.ts).

const INDEX_PATH = resolve(import.meta.dirname, "../../../data/signals/index.json");

export const signals: Source = {
  id: "signals",
  description: "Attaches reference/quality signals (mentions, bookmarks, influencer cites) from data/signals/index.json.",
  trust: "supplementary",
  async run(_ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    if (!existsSync(INDEX_PATH)) {
      warnings.push("data/signals/index.json absent — run the signal miners (scripts/signals/) first");
      return { source: "signals", warnings, estimatedCostUsd: 0 };
    }

    const parsed = signalsIndexSchema.safeParse(JSON.parse(readFileSync(INDEX_PATH, "utf8")));
    if (!parsed.success) {
      warnings.push(`signals index failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
      return { source: "signals", warnings, estimatedCostUsd: 0 };
    }
    const index = parsed.data.entities;

    const models: Model[] = [];
    const tools: Tool[] = [];
    const repos: Repo[] = [];
    let attached = 0;

    for (const m of loadModels()) {
      const s = index[m.id];
      if (s) { models.push({ ...m, signals: s }); attached++; }
    }
    for (const t of loadTools()) {
      const s = index[t.id];
      if (s) { tools.push({ ...t, signals: s }); attached++; }
    }
    for (const r of loadRepos()) {
      const s = index[r.id];
      if (s) { repos.push({ ...r, signals: s }); attached++; }
    }

    const orphans = Object.keys(index).length - attached;
    warnings.unshift(`attached signals to ${attached} entities${orphans > 0 ? ` (${orphans} index entries matched no tracked entity)` : ""}`);
    return { source: "signals", models, tools, repos, warnings, estimatedCostUsd: 0 };
  },
};
