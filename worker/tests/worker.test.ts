import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

class MemoryKV {
  private values = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = opts?.expirationTtl === undefined ? undefined : Date.now() + opts.expirationTtl * 1000;
    this.values.set(key, { value, expiresAt });
  }

  async list(opts?: { prefix?: string; cursor?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }> {
    const prefix = opts?.prefix ?? "";
    for (const key of this.values.keys()) await this.get(key);
    const start = opts?.cursor ? Number(opts.cursor) : 0;
    const allKeys = Array.from(this.values.keys()).filter((name) => name.startsWith(prefix)).sort();
    const page = allKeys.slice(start, start + 1000);
    const next = start + page.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: next >= allKeys.length,
      ...(next < allKeys.length ? { cursor: String(next) } : {}),
    };
  }
}

function makeEnv() {
  return {
    VOTES: new MemoryKV(),
    RATELIMIT: new MemoryKV(),
    GITHUB_REPO: "owner/repo",
    QUEUE_BRANCH: "submissions/queue",
    ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers CORS preflight", async () => {
    const res = await worker.fetch(req("/submit", { method: "OPTIONS" }), makeEnv() as any);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("reports missing required environment bindings before handling routes", async () => {
    const env = { ...makeEnv(), GITHUB_TOKEN: "" };
    const res = await worker.fetch(req("/submit", { method: "POST", body: "{}" }), env as any);

    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: "worker misconfigured: GITHUB_TOKEN not set" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
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
      req("/upvote", {
        method: "POST",
        headers: { "user-agent": "vitest-rotated" },
        body: JSON.stringify({ entity: "openai__gpt-5.5", turnstile: "ok" }),
      }),
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
            summary: "OpenAI released GPT-5.5 with résumé and 日本語 support.",
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
    expect(queued).toContain("résumé and 日本語 support");
    expect(queued).not.toContain("submitter@example.com");
  });

  it("rate-limits submissions after the daily cap", async () => {
    const env = { ...makeEnv(), RATE_LIMIT_PER_DAY: "1" };
    const body = JSON.stringify({
      kind: "event",
      source: "https://openai.com/index/gpt-5-5",
      turnstile: "ok",
      event: {
        entity: "openai__gpt-5.5",
        type: "released",
        date: "2026-04-24",
        summary: "OpenAI released GPT-5.5.",
      },
    });

    const first = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(first.status).toBe(200);

    const second = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(second.status).toBe(429);
    expect(await readJson(second)).toEqual({ error: "rate-limited (1/day)" });
  });

  it("rate-limits the same ip even when user-agent changes", async () => {
    const env = { ...makeEnv(), RATE_LIMIT_PER_DAY: "1" };
    const body = JSON.stringify({
      kind: "event",
      source: "https://openai.com/index/gpt-5-5",
      turnstile: "ok",
      event: {
        entity: "openai__gpt-5.5",
        type: "released",
        date: "2026-04-24",
        summary: "OpenAI released GPT-5.5.",
      },
    });

    const first = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(first.status).toBe(200);

    const rotatedUa = await worker.fetch(req("/submit", { method: "POST", headers: { "user-agent": "vitest-rotated" }, body }), env as any);
    expect(rotatedUa.status).toBe(429);
    expect(await readJson(rotatedUa)).toEqual({ error: "rate-limited (1/day)" });
  });

  it("expires submission rate-limit entries after 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T01:00:00.000Z"));

    const env = { ...makeEnv(), RATE_LIMIT_PER_DAY: "1" };
    const body = JSON.stringify({
      kind: "event",
      source: "https://openai.com/index/gpt-5-5",
      turnstile: "ok",
      event: {
        entity: "openai__gpt-5.5",
        type: "released",
        date: "2026-04-24",
        summary: "OpenAI released GPT-5.5.",
      },
    });

    const first = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(first.status).toBe(200);

    const capped = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(capped.status).toBe(429);

    vi.setSystemTime(new Date("2026-05-28T01:00:01.000Z"));
    expect((await env.RATELIMIT.list({ prefix: "rl:2026-05-27:" })).keys).toEqual([]);

    const afterExpiry = await worker.fetch(req("/submit", { method: "POST", body }), env as any);
    expect(afterExpiry.status).toBe(200);
  });

  it("expires vote guard keys after 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T01:00:00.000Z"));

    const env = makeEnv();
    const body = JSON.stringify({ entity: "openai__gpt-5.5", turnstile: "ok" });

    const first = await worker.fetch(req("/upvote", { method: "POST", body }), env as any);
    expect(first.status).toBe(200);
    expect(await readJson(first)).toMatchObject({ count: 1 });

    const duplicate = await worker.fetch(req("/upvote", { method: "POST", body }), env as any);
    expect(duplicate.status).toBe(200);
    expect(await readJson(duplicate)).toMatchObject({ message: "already voted today" });

    vi.setSystemTime(new Date("2026-05-28T01:00:01.000Z"));

    const afterExpiry = await worker.fetch(req("/upvote", { method: "POST", body }), env as any);
    expect(afterExpiry.status).toBe(200);
    expect(await readJson(afterExpiry)).toMatchObject({ count: 2 });
  });

  it("paginates vote counts across KV list pages", async () => {
    const env = makeEnv();
    for (let i = 0; i < 1005; i += 1) {
      await env.VOTES.put(`count:test-${i}`, String(i));
    }

    const res = await worker.fetch(req("/votes"), env as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as { counts: Record<string, number> };
    expect(Object.keys(body.counts)).toHaveLength(1005);
    expect(body.counts["test-0"]).toBe(0);
    expect(body.counts["test-1004"]).toBe(1004);
  });

  it("rejects submissions when Turnstile fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: false });
      }
      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
          turnstile: "bad",
          event: {
            entity: "openai__gpt-5.5",
            type: "released",
            date: "2026-04-24",
            summary: "OpenAI released GPT-5.5.",
          },
        }),
      }),
      makeEnv() as any,
    );

    expect(res.status).toBe(403);
    expect(await readJson(res)).toEqual({ error: "turnstile failed" });
  });

  it("rejects malformed upvote entity ids before writing KV keys", async () => {
    const res = await worker.fetch(
      req("/upvote", {
        method: "POST",
        body: JSON.stringify({ entity: "foo:bar", turnstile: "ok" }),
      }),
      makeEnv() as any,
    );

    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: "invalid entity id" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("drops low-confidence moderation results before queueing", async () => {
    const env = makeEnv();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: true });
      }

      if (url === "https://api.anthropic.com/v1/messages") {
        return Response.json({
          content: [{ text: JSON.stringify({ classification: "new-event", confidence: 0.1, reason: "Too weak." }) }],
        });
      }

      if (url.startsWith("https://api.github.com/repos/owner/repo/contents/submissions/")) {
        return Response.json({ error: "should not queue" }, { status: 500 });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
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
      message: "rejected",
      reason: "Too weak.",
      classification: "new-event",
      confidence: 0.1,
    });
    expect(githubPuts).toHaveLength(0);
  });

  it("reports moderator infrastructure failures as server errors", async () => {
    const env = makeEnv();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: true });
      }

      if (url === "https://api.anthropic.com/v1/messages") {
        return Response.json({ error: "unknown model" }, { status: 400 });
      }

      if (url.startsWith("https://api.github.com/repos/owner/repo/contents/submissions/")) {
        return Response.json({ error: "should not queue" }, { status: 500 });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
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

    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: "moderation failed", reason: "moderator error HTTP 400" });
    expect(githubPuts).toHaveLength(0);
  });

  it("reports malformed moderator JSON as a retryable server error", async () => {
    const env = makeEnv();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: true });
      }

      if (url === "https://api.anthropic.com/v1/messages") {
        return Response.json({ content: [{ text: "not json" }] });
      }

      if (url.startsWith("https://api.github.com/repos/owner/repo/contents/submissions/")) {
        return Response.json({ error: "should not queue" }, { status: 500 });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
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

    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: "moderation failed", reason: "parse failed: not json" });
    expect(githubPuts).toHaveLength(0);
  });

  it("queues repo submissions as new entities", async () => {
    const env = makeEnv();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        return Response.json({ success: true });
      }

      if (url === "https://api.anthropic.com/v1/messages") {
        return Response.json({
          content: [{ text: JSON.stringify({ classification: "new-entity", confidence: 0.86, reason: "Relevant repo." }) }],
        });
      }

      if (url.startsWith("https://api.github.com/repos/owner/repo/contents/submissions/")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          githubPuts.push(body);
          return Response.json({ commit: { html_url: "https://github.com/owner/repo/commit/def456" } });
        }
        return Response.json({ message: "not found" }, { status: 404 });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "repo",
          source: "https://github.com/owner/agent-repo",
          turnstile: "ok",
          entity: {
            kind: "repo",
            full_name: "owner/agent-repo",
            category: "agent-framework",
            repo_url: "https://github.com/owner/agent-repo",
            notes: "Agent framework with public docs.",
          },
        }),
      }),
      env as any,
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({
      message: "queued for review",
      commit: "https://github.com/owner/repo/commit/def456",
      classification: "new-entity",
    });
    const queued = Buffer.from(githubPuts.at(-1).content, "base64").toString("utf8");
    expect(queued).toContain("\"kind\":\"repo\"");
    expect(queued).toContain("\"full_name\":\"owner/agent-repo\"");
  });

  it("retries queue writes once after a GitHub content SHA race", async () => {
    const env = makeEnv();
    let putCount = 0;

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
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
          putCount += 1;
          const body = JSON.parse(String(init.body));
          githubPuts.push(body);
          if (putCount === 1) return Response.json({ message: "sha mismatch" }, { status: 409 });
          return Response.json({ commit: { html_url: "https://github.com/owner/repo/commit/retry" } });
        }
        return Response.json({
          sha: "current-sha",
          content: Buffer.from("existing café\n").toString("base64"),
        });
      }

      return Response.json({ error: `unexpected fetch ${url}` }, { status: 500 });
    });

    const res = await worker.fetch(
      req("/submit", {
        method: "POST",
        body: JSON.stringify({
          kind: "event",
          source: "https://openai.com/index/gpt-5-5",
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
    expect(await readJson(res)).toMatchObject({ commit: "https://github.com/owner/repo/commit/retry" });
    expect(putCount).toBe(2);
    expect(Buffer.from(githubPuts.at(-1).content, "base64").toString("utf8")).toContain("existing café\n");
  });
});
