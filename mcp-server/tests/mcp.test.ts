// Integration tests for the MCP server. Spawns the built server over stdio,
// drives it via JSON-RPC, asserts the tools behave end-to-end against the
// live ai-tracker site (or AI_TRACKER_BASE override).
//
// Network-dependent — gated behind RUN_MCP_TESTS=1 so `pnpm test` from the
// site root doesn't fail when offline. Run explicitly:
//   RUN_MCP_TESTS=1 pnpm --filter ./mcp-server test

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";

const SHOULD_RUN = process.env.RUN_MCP_TESTS === "1";
const describeIf = SHOULD_RUN ? describe : describe.skip;

let proc: ChildProcessWithoutNullStreams;
let nextId = 1;
const pending = new Map<number, (resp: any) => void>();

function send(method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolveResp, rejectResp) => {
    pending.set(id, resolveResp);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rejectResp(new Error(`timeout: ${method}`));
      }
    }, 12000);
  });
}

function call(name: string, args: Record<string, unknown> = {}) {
  return send("tools/call", { name, arguments: args });
}

function parseResult(resp: any): any {
  const text = resp.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : resp;
}

describeIf("ai-tracker MCP server", () => {
  beforeAll(() => {
    const dist = resolve(import.meta.dirname, "..", "dist", "index.js");
    proc = spawn("node", [dist], { stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    proc.stdout.on("data", (chunk) => {
      buf += String(chunk);
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
          }
        } catch {
          /* startup banner / non-json — ignore */
        }
      }
    });
    proc.stderr.on("data", () => { /* connection log */ });
  });

  afterAll(() => {
    proc?.kill();
  });

  it("lists 6 tools", async () => {
    const resp = await send("tools/list");
    const names = resp.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "search_models", "search_tools", "search_repos", "get_entity", "get_timeline", "recent_events",
    ]));
    expect(names).toHaveLength(6);
  });

  it("search_models filters by provider", async () => {
    const r = parseResult(await call("search_models", { provider: "anthropic", limit: 50 }));
    expect(r.count).toBeGreaterThan(0);
    expect(r.models.every((m: { provider: string }) => m.provider === "anthropic")).toBe(true);
  });

  it("search_models filters by max_input_price", async () => {
    const r = parseResult(await call("search_models", { max_input_price: 1, limit: 50 }));
    for (const m of r.models) {
      expect(m.input_price).toBeLessThanOrEqual(1);
    }
  });

  it("search_models filters by min_context", async () => {
    const r = parseResult(await call("search_models", { min_context: 1_000_000, limit: 50 }));
    for (const m of r.models) {
      expect(m.context).toBeGreaterThanOrEqual(1_000_000);
    }
  });

  it("search_tools filters by category + oss_only", async () => {
    const r = parseResult(await call("search_tools", { category: "agent-framework", oss_only: true, limit: 50 }));
    for (const t of r.tools) {
      expect(t.category).toBe("agent-framework");
      expect(t.oss).toBe(true);
    }
  });

  it("search_repos filters by category", async () => {
    const r = parseResult(await call("search_repos", { category: "agent-framework", limit: 50 }));
    expect(r.count).toBeGreaterThan(0);
    for (const repo of r.repos) {
      expect(repo.category).toBe("agent-framework");
    }
  });

  it("get_entity returns full record + events for a known model", async () => {
    const r = parseResult(await call("get_entity", { id: "anthropic__claude-opus-4-7" }));
    expect(r.entity).toBeDefined();
    expect(r.entity.name).toMatch(/Opus 4\.7/);
    expect(r.entity.pricing).toBeDefined();
    expect(Array.isArray(r.entity.events)).toBe(true);
  });

  it("get_entity returns error for unknown id", async () => {
    const r = parseResult(await call("get_entity", { id: "doesnt-exist__xyz" }));
    expect(r.error).toBeDefined();
  });

  it("get_timeline returns events array for a known entity", async () => {
    const r = parseResult(await call("get_timeline", { id: "anthropic__claude-opus-4-7" }));
    expect(r.id).toBe("anthropic__claude-opus-4-7");
    expect(Array.isArray(r.events)).toBe(true);
  });

  it("recent_events returns newest-first events", async () => {
    const r = parseResult(await call("recent_events", { limit: 10 }));
    expect(r.events.length).toBeGreaterThan(0);
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i - 1].date >= r.events[i].date).toBe(true);
    }
  });

  it("recent_events filters by since date", async () => {
    const cutoff = "2026-01-01";
    const r = parseResult(await call("recent_events", { since: cutoff, limit: 100 }));
    for (const e of r.events) {
      expect(e.date >= cutoff).toBe(true);
    }
  });

  it("recent_events filters by type", async () => {
    const r = parseResult(await call("recent_events", { types: ["released"], limit: 100 }));
    for (const e of r.events) {
      expect(e.type).toBe("released");
    }
  });
});

if (!SHOULD_RUN) {
  describe.skip("ai-tracker MCP server (skipped — set RUN_MCP_TESTS=1)", () => {
    it("noop", () => {});
  });
}
