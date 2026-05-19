import type { Event, Model, Repo, Tool } from "../../schemas/index.ts";

export interface ModelDiff {
  added: Model[];
  updated: { id: string; from: Partial<Model>; to: Partial<Model>; fields: string[] }[];
  unchanged: number;
}

export interface ToolDiff {
  added: Tool[];
  updated: { id: string; from: Partial<Tool>; to: Partial<Tool>; fields: string[] }[];
  unchanged: number;
}

export interface RepoDiff {
  added: Repo[];
  updated: { id: string; from: Partial<Repo>; to: Partial<Repo>; fields: string[] }[];
  unchanged: number;
}

export interface EventDiff {
  added: Event[];
}

const MODEL_TRACKED_FIELDS = [
  "name",
  "provider",
  "released",
  "context_window",
  "output_window",
  "modalities",
  "license",
  "pricing",
  "status",
  "links",
  "tags",
  "sources",
] as const;

const TOOL_TRACKED_FIELDS = [
  "name",
  "vendor",
  "category",
  "released",
  "built_on_models",
  "oss",
  "pricing_tiers",
  "free_tier",
  "modalities",
  "status",
  "links",
  "tags",
  "sources",
] as const;

const REPO_TRACKED_FIELDS = [
  "owner",
  "name",
  "full_name",
  "description",
  "category",
  "language",
  "license",
  "stars",
  "forks",
  "open_issues",
  "topics",
  "homepage",
  "repo_url",
  "package_urls",
  "created_at",
  "pushed_at",
  "archived",
  "tags",
  "sources",
] as const;

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffModels(current: Model[], proposed: Model[]): ModelDiff {
  const byId = new Map(current.map((m) => [m.id, m]));
  const added: Model[] = [];
  const updated: ModelDiff["updated"] = [];
  let unchanged = 0;
  for (const p of proposed) {
    const cur = byId.get(p.id);
    if (!cur) {
      added.push(p);
      continue;
    }
    const fields: string[] = [];
    const from: Partial<Model> = {};
    const to: Partial<Model> = {};
    for (const f of MODEL_TRACKED_FIELDS) {
      if (!eq(cur[f], p[f])) {
        fields.push(f);
        (from as Record<string, unknown>)[f] = cur[f];
        (to as Record<string, unknown>)[f] = p[f];
      }
    }
    if (fields.length > 0) updated.push({ id: p.id, from, to, fields });
    else unchanged++;
  }
  return { added, updated, unchanged };
}

export function diffTools(current: Tool[], proposed: Tool[]): ToolDiff {
  const byId = new Map(current.map((t) => [t.id, t]));
  const added: Tool[] = [];
  const updated: ToolDiff["updated"] = [];
  let unchanged = 0;
  for (const p of proposed) {
    const cur = byId.get(p.id);
    if (!cur) {
      added.push(p);
      continue;
    }
    const fields: string[] = [];
    const from: Partial<Tool> = {};
    const to: Partial<Tool> = {};
    for (const f of TOOL_TRACKED_FIELDS) {
      if (!eq(cur[f], p[f])) {
        fields.push(f);
        (from as Record<string, unknown>)[f] = cur[f];
        (to as Record<string, unknown>)[f] = p[f];
      }
    }
    if (fields.length > 0) updated.push({ id: p.id, from, to, fields });
    else unchanged++;
  }
  return { added, updated, unchanged };
}

export function diffRepos(current: Repo[], proposed: Repo[]): RepoDiff {
  const byId = new Map(current.map((r) => [r.id, r]));
  const added: Repo[] = [];
  const updated: RepoDiff["updated"] = [];
  let unchanged = 0;
  for (const p of proposed) {
    const cur = byId.get(p.id);
    if (!cur) {
      added.push(p);
      continue;
    }
    const fields: string[] = [];
    const from: Partial<Repo> = {};
    const to: Partial<Repo> = {};
    for (const f of REPO_TRACKED_FIELDS) {
      if (!eq(cur[f], p[f])) {
        fields.push(f);
        (from as Record<string, unknown>)[f] = cur[f];
        (to as Record<string, unknown>)[f] = p[f];
      }
    }
    if (fields.length > 0) updated.push({ id: p.id, from, to, fields });
    else unchanged++;
  }
  return { added, updated, unchanged };
}

export function diffEvents(current: Event[], proposed: Event[]): EventDiff {
  const seen = new Set(current.map((e) => `${e.date}__${e.entity}__${e.type}`));
  const added = proposed.filter((e) => !seen.has(`${e.date}__${e.entity}__${e.type}`));
  return { added };
}
