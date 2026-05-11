import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Event, Model, Tool } from "../../schemas/index.ts";
import type { EventDiff, ModelDiff, ToolDiff } from "./diff.ts";

export interface WriteTarget {
  /** Absolute path to the data root (with subdirs models/, tools/, events/). */
  dataRoot: string;
  /** True = clear & rewrite; false = additive (added writes only, updated entries get overwritten in place). */
  fresh?: boolean;
  /** True = skip new entries (added.*), only write updated.* + events. Use when supplementary sources
   * propose new entities that should require human review before being added to the curated set. */
  updatesOnly?: boolean;
}

export interface WriteResult {
  modelsAdded: number;
  modelsUpdated: number;
  toolsAdded: number;
  toolsUpdated: number;
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
  eventDiff: EventDiff,
  mergedModels: Model[],
  mergedTools: Tool[],
  target: WriteTarget,
): WriteResult {
  const root = target.dataRoot;
  if (target.fresh) {
    rmSync(root, { recursive: true, force: true });
  }
  mkdirSync(join(root, "models"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
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
    eventsAdded: eventDiff.added.length,
    paths,
  };
}
