import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoCandidateQueueSchema, type Event, type Model, type Repo, type Tool } from "../../schemas/index.ts";
import type { EventDiff, ModelDiff, RepoDiff, ToolDiff } from "./diff.ts";
import { partitionAutoPromote } from "./auto-promote.ts";

export interface WriteTarget {
  /** Absolute path to the data root (with subdirs models/, tools/, repos/, events/). */
  dataRoot: string;
  /** True = clear & rewrite; false = additive (added writes only, updated entries get overwritten in place). */
  fresh?: boolean;
  /** True = skip new entries (added.*), only write updated.* + events. Use when supplementary sources
   * propose new entities that should require human review before being added to the curated set.
   * EXCEPTION: newly-discovered repos that clear the strict auto-promotion bar
   * (see auto-promote.ts) are still written, to widen coverage without manual gating. */
  updatesOnly?: boolean;
  /** Clock for auto-promotion recency checks (defaults to now). */
  now?: Date;
}

export interface WriteResult {
  modelsAdded: number;
  modelsUpdated: number;
  toolsAdded: number;
  toolsUpdated: number;
  reposAdded: number;
  reposUpdated: number;
  eventsAdded: number;
  paths: string[];
}

function eventSlug(e: Event): string {
  // Mirrors data/events/<date>__<entity>__<type>.json — collisions on (date,entity,type) deliberately overwrite.
  return `${e.date}__${e.entity}__${e.type}.json`;
}

function writeJson(path: string, body: unknown): void {
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

export function writeDiff(
  modelDiff: ModelDiff,
  toolDiff: ToolDiff,
  repoDiff: RepoDiff,
  eventDiff: EventDiff,
  mergedModels: Model[],
  mergedTools: Tool[],
  mergedRepos: Repo[],
  target: WriteTarget,
): WriteResult {
  const root = target.dataRoot;
  if (target.fresh) {
    rmSync(root, { recursive: true, force: true });
  }
  mkdirSync(join(root, "models"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
  mkdirSync(join(root, "repos"), { recursive: true });
  mkdirSync(join(root, "events"), { recursive: true });

  const paths: string[] = [];

  const mergedModelById = new Map(mergedModels.map((m) => [m.id, m]));
  if (!target.updatesOnly) {
    for (const m of modelDiff.added) {
      const path = join(root, "models", `${m.id}.json`);
      writeJson(path, m);
      paths.push(path);
    }
  }
  for (const u of modelDiff.updated) {
    const merged = mergedModelById.get(u.id);
    if (!merged) continue;
    const path = join(root, "models", `${u.id}.json`);
    writeJson(path, merged);
    paths.push(path);
  }

  const mergedToolById = new Map(mergedTools.map((t) => [t.id, t]));
  if (!target.updatesOnly) {
    for (const t of toolDiff.added) {
      const path = join(root, "tools", `${t.id}.json`);
      writeJson(path, t);
      paths.push(path);
    }
  }
  for (const u of toolDiff.updated) {
    const merged = mergedToolById.get(u.id);
    if (!merged) continue;
    const path = join(root, "tools", `${u.id}.json`);
    writeJson(path, merged);
    paths.push(path);
  }

  const mergedRepoById = new Map(mergedRepos.map((r) => [r.id, r]));
  // In updatesOnly mode, new repos normally require human review — but those that
  // clear the strict auto-promotion bar are written straight in to widen coverage.
  const reposToAdd = target.updatesOnly
    ? partitionAutoPromote(repoDiff.added, { now: target.now }).promote
    : repoDiff.added;
  for (const r of reposToAdd) {
    const path = join(root, "repos", `${r.id}.json`);
    writeJson(path, r);
    paths.push(path);
  }
  for (const u of repoDiff.updated) {
    const merged = mergedRepoById.get(u.id);
    if (!merged) continue;
    const path = join(root, "repos", `${u.id}.json`);
    writeJson(path, merged);
    paths.push(path);
  }

  for (const e of eventDiff.added) {
    const path = join(root, "events", eventSlug(e));
    writeJson(path, e);
    paths.push(path);
  }

  return {
    modelsAdded: target.updatesOnly ? 0 : modelDiff.added.length,
    modelsUpdated: modelDiff.updated.length,
    toolsAdded: target.updatesOnly ? 0 : toolDiff.added.length,
    toolsUpdated: toolDiff.updated.length,
    reposAdded: reposToAdd.length,
    reposUpdated: repoDiff.updated.length,
    eventsAdded: eventDiff.added.length,
    paths,
  };
}

export function writeRepoCandidateQueue(dataRoot: string, source: string, generatedAt: string, candidates: Repo[]): string {
  const dir = join(dataRoot, "repo-candidates");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${source}.json`);
  const existing = existsSync(path)
    ? repoCandidateQueueSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown).candidates
    : [];
  const mergedCandidates = new Map(existing.map((candidate) => [candidate.id, candidate]));
  for (const candidate of candidates) {
    mergedCandidates.set(candidate.id, candidate);
  }
  const queue = repoCandidateQueueSchema.parse({
    kind: "repo-candidate-queue",
    source,
    generated_at: generatedAt,
    candidates: Array.from(mergedCandidates.values()).sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.full_name.localeCompare(b.full_name)),
  });
  writeJson(path, queue);
  return path;
}
