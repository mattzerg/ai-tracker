#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = (process.env.AI_TRACKER_BASE ?? "https://ai-tracker-dxu.pages.dev").replace(/\/$/, "");
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Model {
  kind: "model";
  id: string;
  name: string;
  provider: string;
  released: string | null;
  context_window: number | null;
  modalities: string[];
  license: string;
  pricing: { input_per_mtok: number | null; output_per_mtok: number | null; as_of: string } | null;
  tags: string[];
  links: Record<string, string | undefined>;
}
interface Tool {
  kind: "tool";
  id: string;
  name: string;
  vendor: string;
  category: string;
  released: string | null;
  homepage: string;
  built_on_models: string[];
  oss: boolean;
  free_tier: boolean;
  tags: string[];
}
interface Event {
  date: string;
  entity: string;
  type: string;
  summary: string;
  source: string;
}
interface Dump {
  generated_at: string;
  models: Model[];
  tools: Tool[];
  events: Event[];
}

let cache: { fetched: number; data: Dump } | null = null;

async function getDump(): Promise<Dump> {
  if (cache && Date.now() - cache.fetched < CACHE_TTL_MS) return cache.data;
  const res = await fetch(`${BASE}/dump/all.json`, { headers: { "user-agent": "ai-tracker-mcp/0.0.1" } });
  if (!res.ok) throw new Error(`failed to fetch dump: HTTP ${res.status}`);
  const data = (await res.json()) as Dump;
  cache = { fetched: Date.now(), data };
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

const server = new Server({ name: "ai-tracker", version: "0.0.1" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const dump = await getDump();
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  const { models, tools: dumpTools, events } = dump;

  switch (req.params.name) {
    case "search_models": {
      const q = (args.query as string | undefined) ?? "";
      const provider = args.provider as string | undefined;
      const minCtx = args.min_context as number | undefined;
      const maxIn = args.max_input_price as number | undefined;
      const limit = (args.limit as number | undefined) ?? 20;
      const out = models
        .filter((m) => !provider || m.provider === provider)
        .filter((m) => !minCtx || (m.context_window ?? 0) >= minCtx)
        .filter((m) => maxIn == null || (m.pricing?.input_per_mtok ?? Infinity) <= maxIn)
        .filter((m) => !q || matchQuery(`${m.name} ${m.provider} ${(m.tags ?? []).join(" ")}`, q))
        .slice(0, limit)
        .map((m) => ({ id: m.id, name: m.name, provider: m.provider, released: m.released, context_window: m.context_window, pricing: m.pricing }));
      return textResult({ count: out.length, models: out });
    }
    case "search_tools": {
      const q = (args.query as string | undefined) ?? "";
      const category = args.category as string | undefined;
      const ossOnly = args.oss_only as boolean | undefined;
      const freeOnly = args.free_tier_only as boolean | undefined;
      const limit = (args.limit as number | undefined) ?? 20;
      const out = dumpTools
        .filter((t) => !category || t.category === category)
        .filter((t) => !ossOnly || t.oss)
        .filter((t) => !freeOnly || t.free_tier)
        .filter((t) => !q || matchQuery(`${t.name} ${t.vendor} ${(t.tags ?? []).join(" ")}`, q))
        .slice(0, limit)
        .map((t) => ({ id: t.id, name: t.name, vendor: t.vendor, category: t.category, oss: t.oss, free_tier: t.free_tier, homepage: t.homepage, built_on_models: t.built_on_models }));
      return textResult({ count: out.length, tools: out });
    }
    case "get_entity": {
      const id = args.id as string;
      const entity = models.find((m) => m.id === id) ?? dumpTools.find((t) => t.id === id);
      if (!entity) return textResult({ error: `not found: ${id}` });
      const entityEvents = events.filter((e) => e.entity === id);
      return textResult({ entity, events: entityEvents });
    }
    case "get_timeline": {
      const id = args.id as string;
      const entityEvents = events.filter((e) => e.entity === id);
      return textResult({ id, count: entityEvents.length, events: entityEvents });
    }
    case "recent_events": {
      const types = args.types as string[] | undefined;
      const since = args.since as string | undefined;
      const limit = (args.limit as number | undefined) ?? 50;
      const out = events
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
  console.error(`ai-tracker-mcp connected. base=${BASE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
