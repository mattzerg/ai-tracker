import { describe, it, expect } from "vitest";
import type { Repo } from "../../schemas/index.ts";
import { autoPromoteRepo, partitionAutoPromote } from "./auto-promote.ts";

const NOW = new Date("2026-06-09T00:00:00Z");

function repo(over: Partial<Repo>): Repo {
  return {
    kind: "repo",
    id: "github__acme_thing",
    owner: "acme",
    name: "thing",
    full_name: "acme/thing",
    description: "A real AI agent framework for building autonomous systems.",
    category: "agent-framework",
    language: "Python",
    license: "MIT License",
    stars: 15000, // above the 10k auto-promote floor
    forks: 100,
    open_issues: 10,
    topics: ["ai-agent"],
    homepage: undefined,
    repo_url: "https://github.com/acme/thing",
    package_urls: [],
    created_at: "2024-01-01",
    pushed_at: "2026-05-01", // recent
    archived: false,
    tags: ["ai-agent"],
    sources: ["https://github.com/acme/thing"],
    ...over,
  } as Repo;
}

describe("autoPromoteRepo", () => {
  it("promotes a real, active, well-starred, licensed, categorized repo", () => {
    expect(autoPromoteRepo(repo({}), { now: NOW })).toBe(true);
  });

  it("rejects archived repos", () => {
    expect(autoPromoteRepo(repo({ archived: true }), { now: NOW })).toBe(false);
  });

  it("rejects uncategorized (other) repos", () => {
    expect(autoPromoteRepo(repo({ category: "other" }), { now: NOW })).toBe(false);
  });

  it("rejects low-star repos (below the 10k floor)", () => {
    expect(autoPromoteRepo(repo({ stars: 5000 }), { now: NOW })).toBe(false);
  });

  it("rejects unlicensed repos", () => {
    expect(autoPromoteRepo(repo({ license: null }), { now: NOW })).toBe(false);
  });

  it("rejects stale repos (pushed long ago)", () => {
    expect(autoPromoteRepo(repo({ pushed_at: "2024-01-01" }), { now: NOW })).toBe(false);
  });

  it("rejects junk/awesome-list names even when popular", () => {
    expect(autoPromoteRepo(repo({ name: "awesome-llm", description: "A curated list of LLM resources." }), { now: NOW })).toBe(false);
  });

  it("rejects educational/reference content that self-tags AI (interview guides, prompt lists)", () => {
    expect(autoPromoteRepo(repo({ name: "JavaGuide", description: "Java 面试 guide covering AI 应用开发" }), { now: NOW })).toBe(false);
    expect(autoPromoteRepo(repo({ name: "prompts.chat", description: "Awesome ChatGPT Prompts collection" }), { now: NOW })).toBe(false);
  });

  it("rejects repos whose description does not corroborate AI (topic mis-tag)", () => {
    expect(autoPromoteRepo(repo({ name: "nginx-ui", description: "Yet another WebUI for Nginx" }), { now: NOW })).toBe(false);
  });

  it("partitions a mixed set", () => {
    const { promote, queue } = partitionAutoPromote(
      [repo({ id: "a" }), repo({ id: "b", stars: 900 }), repo({ id: "c", category: "other" })],
      { now: NOW },
    );
    expect(promote.map((r) => r.id)).toEqual(["a"]);
    expect(queue.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });
});
