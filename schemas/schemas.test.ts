import { describe, expect, it } from "vitest";
import { eventSchema, modelSchema, repoCandidateQueueSchema, repoSchema, toolSchema } from "./index.ts";

describe("modelSchema", () => {
  it("accepts a minimal valid model", () => {
    const r = modelSchema.safeParse({
      kind: "model",
      id: "anthropic__claude-opus-4-7",
      name: "Claude Opus 4.7",
      provider: "anthropic",
      released: "2026-04-15",
      context_window: 1_000_000,
      modalities: ["text"],
      license: "proprietary",
      pricing: null,
      links: {},
      sources: ["https://example.com"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts null released", () => {
    const r = modelSchema.safeParse({
      kind: "model",
      id: "openai__gpt-5",
      name: "GPT-5",
      provider: "openai",
      released: null,
      context_window: 1_000_000,
      modalities: ["text"],
      license: "proprietary",
      pricing: null,
      links: {},
      sources: ["https://example.com"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad date", () => {
    const r = modelSchema.safeParse({
      kind: "model",
      id: "x__y",
      name: "y",
      provider: "x",
      released: "April 2026",
      context_window: 1,
      modalities: ["text"],
      license: "proprietary",
      pricing: null,
      links: {},
      sources: ["https://example.com"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects entries without sources", () => {
    const r = modelSchema.safeParse({
      kind: "model",
      id: "x__y",
      name: "y",
      provider: "x",
      released: "2026-01-01",
      context_window: 1,
      modalities: ["text"],
      license: "proprietary",
      pricing: null,
      links: {},
      sources: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("toolSchema", () => {
  it("accepts a minimal valid tool", () => {
    const r = toolSchema.safeParse({
      kind: "tool",
      id: "cursor",
      name: "Cursor",
      vendor: "Anysphere",
      category: "ide",
      released: "2023-03-15",
      oss: false,
      free_tier: true,
      links: { homepage: "https://cursor.sh" },
      sources: ["https://cursor.sh"],
    });
    expect(r.success).toBe(true);
  });
});

describe("repoSchema", () => {
  it("accepts a minimal valid repo", () => {
    const r = repoSchema.safeParse({
      kind: "repo",
      id: "github__langchain-ai_langchain",
      owner: "langchain-ai",
      name: "langchain",
      full_name: "langchain-ai/langchain",
      description: "Build context-aware reasoning applications.",
      category: "agent-framework",
      language: "Python",
      license: "MIT",
      repo_url: "https://github.com/langchain-ai/langchain",
      created_at: null,
      pushed_at: null,
      sources: ["https://github.com/langchain-ai/langchain"],
    });
    expect(r.success).toBe(true);
  });
});

describe("repoCandidateQueueSchema", () => {
  it("accepts a repo candidate queue", () => {
    const candidate = {
      kind: "repo",
      id: "github__langchain-ai_langchain",
      owner: "langchain-ai",
      name: "langchain",
      full_name: "langchain-ai/langchain",
      description: "Build context-aware reasoning applications.",
      category: "agent-framework",
      language: "Python",
      license: "MIT",
      repo_url: "https://github.com/langchain-ai/langchain",
      created_at: null,
      pushed_at: null,
      sources: ["https://github.com/langchain-ai/langchain"],
    };
    const r = repoCandidateQueueSchema.safeParse({
      kind: "repo-candidate-queue",
      source: "github-repos",
      generated_at: "2026-05-13T00:00:00.000Z",
      candidates: [candidate],
    });
    expect(r.success).toBe(true);
  });
});

describe("eventSchema", () => {
  it("accepts a price_change event", () => {
    const r = eventSchema.safeParse({
      date: "2026-05-01",
      entity: "anthropic__claude-opus-4-7",
      type: "price_change",
      summary: "Input price dropped from $20 to $15 / Mtok",
      delta: { field: "pricing.input_per_mtok", from: 20, to: 15 },
      source: "https://anthropic.com/pricing",
      submitted_by: "ingest-bot",
    });
    expect(r.success).toBe(true);
  });

  it("rejects too-long summary", () => {
    const r = eventSchema.safeParse({
      date: "2026-05-01",
      entity: "x__y",
      type: "released",
      summary: "x".repeat(500),
      source: "https://example.com",
      submitted_by: "matt",
    });
    expect(r.success).toBe(false);
  });
});
