#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.AI_TRACKER_BASE ?? "https://ai-tracker-dxu.pages.dev").replace(/\/$/, "");
const CACHE_TTL_MS = 5 * 60 * 1000;
const UA = { "user-agent": "ai-tracker-mcp/0.0.1" };

// Lean search index — used for browse/search/recent_events (24.5KB).
interface LeanModel {
  kind: "model";
  id: string;
  name: string;
  provider: string;
  context: number | null;
  tags: string[];
  license: string;
  input_price: number | null;
  output_price: number | null;
}
interface LeanTool {
  kind: "tool";
  id: string;
  name: string;
  vendor: string;
  category: string;
  oss: boolean;
  free_tier: boolean;
  tags: string[];
  built_on: string[];
}
interface LeanEvent {
  slug: string;
  date: string;
  type: string;
  entity: string;
  entity_name: string | null;
  summary: string;
}
interface SearchIndex {
  generated_at: string;
  schema_version: number;
  models: LeanModel[];
  tools: LeanTool[];
  events: LeanEvent[];
}

// Per-entity twin — used for get_entity / get_timeline. Full record + events.
interface EntityTwin {
  kind: "model" | "tool";
  id: string;
  name: string;
  [k: string]: unknown;
  events?: Array<{ date: string; entity: string; type: string; summary: string; source: string }>;
}

let indexCache: { fetched: number; data: SearchIndex } | null = null;
const entityCache = new Map<string, { fetched: number; data: EntityTwin }>();

async function getIndex(): Promise<SearchIndex> {
  if (indexCache && Date.now() - indexCache.fetched < CACHE_TTL_MS) return indexCache.data;
  const res = await fetch(`${BASE}/api/search.json`, { headers: UA });
  if (!res.ok) throw new Error(`failed to fetch search index: HTTP ${res.status}`);
  const data = (await res.json()) as SearchIndex;
  indexCache = { fetched: Date.now(), data };
  return data;
}

async function getEntity(id: string): Promise<EntityTwin | null> {
  const cached = entityCache.get(id);
  if (cached && Date.now() - cached.fetched < CACHE_TTL_MS) return cached.data;
  // Try /models/<id>.json first, then /tools/<id>.json. Order: fetch index to
  // learn which bucket the id is in, then targeted fetch.
  const idx = await getIndex();
  const isModel = idx.models.some((m) => m.id === id);
  const isTool = idx.tools.some((t) => t.id === id);
  if (!isModel && !isTool) return null;
  const path = isModel ? `/models/${id}.json` : `/tools/${id}.json`;
  const res = await fetch(`${BASE}${path}`, { headers: UA });
  if (!res.ok) return null;
  const data = (await res.json()) as EntityTwin;
  entityCache.set(id, { fetched: Date.now(), data });
  return data;
}

function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function matchQuery(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q.toLowerCase());
}

const tools = [
  {
    name: "search_models",
    description: "Search AI models by free-text query (matches name/provider/tags) and optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text query" },
        provider: { type: "string", description: "Exact provider (e.g. 'anthropic', 'openai')" },
        min_context: { type: "number", description: "Minimum context window in tokens" },
        max_input_price: { type: "number", description: "Max input price per Mtok in USD" },
        max_output_price: { type: "number", description: "Max output price per Mtok in USD" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "search_tools",
    description: "Search AI tools by free-text query (matches name/vendor/tags) and optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text query" },
        category: { type: "string", description: "Exact category (e.g. 'ide', 'agent-framework')" },
        oss_only: { type: "boolean" },
        free_tier_only: { type: "boolean" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "get_entity",
    description: "Fetch a single entity by id (model or tool). Returns full record + its events.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Entity id (e.g. 'anthropic__claude-opus-4-7' or 'cursor')" } },
      required: ["id"],
    },
  },
  {
    name: "get_timeline",
    description: "Get the chronological event timeline for one entity.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "recent_events",
    description: "List events across all entities, newest first. Optional type filter and date range.",
    inputSchema: {
      type: "object",
      properties: {
        types: { type: "array", items: { type: "string" }, description: "Filter to these event types" },
        since: { type: "string", description: "ISO date YYYY-MM-DD lower bound (inclusive)" },
        limit: { type: "number", default: 50 },
      },
    },
  },
];

const server = new Server({ name: "ai-tracker", version: "0.0.3" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  switch (req.params.name) {
    case "search_models": {
      const idx = await getIndex();
      const q = (args.query as string | undefined) ?? "";
      const provider = args.provider as string | undefined;
      const minCtx = args.min_context as number | undefined;
      const maxIn = args.max_input_price as number | undefined;
      const maxOut = args.max_output_price as number | undefined;
      const limit = (args.limit as number | undefined) ?? 20;
      const out = idx.models
        .filter((m) => !provider || m.provider === provider)
        .filter((m) => !minCtx || (m.context ?? 0) >= minCtx)
        .filter((m) => maxIn == null || (m.input_price ?? Infinity) <= maxIn)
        .filter((m) => maxOut == null || (m.output_price ?? Infinity) <= maxOut)
        .filter((m) => !q || matchQuery(`${m.name} ${m.provider} ${(m.tags ?? []).join(" ")}`, q))
        .slice(0, limit);
      return textResult({ count: out.length, models: out });
    }
    case "search_tools": {
      const idx = await getIndex();
      const q = (args.query as string | undefined) ?? "";
      const category = args.category as string | undefined;
      const ossOnly = args.oss_only as boolean | undefined;
      const freeOnly = args.free_tier_only as boolean | undefined;
      const limit = (args.limit as number | undefined) ?? 20;
      const out = idx.tools
        .filter((t) => !category || t.category === category)
        .filter((t) => !ossOnly || t.oss)
        .filter((t) => !freeOnly || t.free_tier)
        .filter((t) => !q || matchQuery(`${t.name} ${t.vendor} ${(t.tags ?? []).join(" ")}`, q))
        .slice(0, limit);
      return textResult({ count: out.length, tools: out });
    }
    case "get_entity": {
      const id = args.id as string;
      const entity = await getEntity(id);
      if (!entity) return textResult({ error: `not found: ${id}` });
      return textResult({ entity });
    }
    case "get_timeline": {
      const id = args.id as string;
      const entity = await getEntity(id);
      if (!entity) return textResult({ error: `not found: ${id}` });
      const events = entity.events ?? [];
      return textResult({ id, count: events.length, events });
    }
    case "recent_events": {
      const idx = await getIndex();
      const types = args.types as string[] | undefined;
      const since = args.since as string | undefined;
      const limit = (args.limit as number | undefined) ?? 50;
      const out = idx.events
        .filter((e) => !types || types.includes(e.type))
        .filter((e) => !since || e.date >= since)
        .slice(0, limit);
      return textResult({ count: out.length, events: out });
    }
    default:
      return textResult({ error: `unknown tool: ${req.params.name}` });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`ai-tracker-mcp v0.0.3 connected. base=${BASE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
