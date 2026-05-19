import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

class MemoryKV {
  private values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async list(opts?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const prefix = opts?.prefix ?? "";
    return {
      keys: Array.from(this.values.keys())
        .filter((name) => name.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
    };
  }
}

function makeEnv() {
  return {
    VOTES: new MemoryKV(),
    RATELIMIT: new MemoryKV(),
    GITHUB_REPO: "owner/repo",
    QUEUE_BRANCH: "submissions/queue",
    ANTHROPIC_MODEL: "claude-haiku-4-5",
    MODERATION_MIN_CONFIDENCE: "0.4",
    RATE_LIMIT_PER_DAY: "5",
    GITHUB_TOKEN: "gh-token",
    TURNSTILE_SECRET: "turnstile-secret",
    ANTHROPIC_API_KEY: "anthropic-key",
  };
}

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://api.example.com${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
      "user-agent": "vitest",
      ...(init.headers ?? {}),
    },
  });
}

async function readJson(res: Response) {
  return (await res.json()) as any;
}

describe("ai-tracker Worker", () => {
  const githubPuts: any[] = [];

  beforeEach(() => {
    githubPuts.length = 0;
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: true });
      }

      if (url === "https://api.anthropic.com/v1/messages") {
        return Response.json({
          content: [{ text: JSON.stringify({ classification: "new-event", confidence: 0.91, reason: "Looks sourced." }) }],
        });
      }

      if (url.startsWith("https://api.github.com/repos/owner/repo/contents/submissions/")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          githubPuts.push(body);
          return Response.json({ commit: { html_url: "https://github.com/owner/repo/commit/abc123" } });
        }
        return Response.json({ message: "not found" }, { status: 404 });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    }));
  });

  it("answers CORS preflight", async () => {
    const res = await worker.fetch(req("/submit", { method: "OPTIONS" }), makeEnv() as any);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("increments an entity vote once per ip and exposes counts", async () => {
    const env = makeEnv();
    const first = await worker.fetch(
      req("/upvote", { method: "POST", body: JSON.stringify({ entity: "openai__gpt-5.5", turnstile: "ok" }) }),
      env as any,
    );
    expect(first.status).toBe(200);
    expect(await readJson(first)).toMatchObject({ entity: "openai__gpt-5.5", count: 1 });

    const duplicate = await worker.fetch(
      req("/upvote", { method: "POST", body: JSON.stringify({ entity: "openai__gpt-5.5", turnstile: "ok" }) }),
      env as any,
    );
    expect(duplicate.status).toBe(200);
    expect(await readJson(duplicate)).toMatchObject({ message: "already voted today" });

    const votes = await worker.fetch(req("/votes", { method: "GET" }), env as any);
    expect(await readJson(votes)).toMatchObject({
      schema_version: 1,
      counts: { "openai__gpt-5.5": 1 },
    });
  });

  it("rejects malformed submit payloads before external moderation", async () => {
    const env = makeEnv();
    const res = await worker.fetch(req("/submit", { method: "POST", body: JSON.stringify({ kind: "event", turnstile: "ok" }) }), env as any);

    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: "source required" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("queues accepted submissions without persisting contact details", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
          contact: "submitter@example.com",
          turnstile: "ok",
          event: {
            entity: "openai__gpt-5.5",
            type: "released",
            date: "2026-04-24",
            summary: "OpenAI released GPT-5.5.",
          },
        }),
      }),
      env as any,
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({
      message: "queued for review",
      commit: "https://github.com/owner/repo/commit/abc123",
      classification: "new-event",
    });

    expect(githubPuts).toHaveLength(1);
    const queued = Buffer.from(githubPuts[0].content, "base64").toString("utf8");
    expect(queued).toContain("\"classification\":\"new-event\"");
    expect(queued).not.toContain("submitter@example.com");
  });
});
