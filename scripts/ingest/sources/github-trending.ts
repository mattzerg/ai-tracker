// First tool source: GitHub repo search via the local `gh` CLI.
// Pulls high-star repos from AI-relevant topics; supplementary trust
// (existing curated tools win on name/category/built_on_models conflicts).

import { execSync } from "node:child_process";
import type { Tool } from "../../../schemas/index.ts";
import type { Source, SourceContext, SourceResult } from "../types.ts";

interface GhRepo {
  name: string;
  description: string | null;
  homepage: string | null;
  isArchived: boolean;
  language: string | null;
  license: { key?: string; name?: string } | null;
  owner: { login: string };
  stargazersCount: number;
  updatedAt: string;
  url: string;
}

const TOPIC_TO_CATEGORY: Record<string, Tool["category"]> = {
  "ai-agent":     "agent-framework",
  "agentic-ai":   "agent-framework",
  "llm":          "agent-framework",
  "mcp-server":   "agent-framework",
  "ai-coding":    "ide",
  "rag":          "rag",
  "vector-db":    "vector-db",
  "browser-use":  "browser-automation",
  "ai-evaluation": "eval",
};

const TOPICS = ["ai-agent", "agentic-ai", "mcp-server"];
const MIN_STARS = 1500;
const PER_TOPIC_LIMIT = 30;
const MAX_DESCRIPTION_LEN = 280;

function slugify(owner: string, name: string): string {
  // schema slug regex: /^[a-z0-9][a-z0-9_-]*$/
  // Combine owner + name, lowercase, replace anything non-[a-z0-9_-] with '-'.
  const combined = `${owner}-${name}`.toLowerCase();
  const cleaned = combined.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return /^[a-z0-9]/.test(cleaned) ? cleaned : `gh-${cleaned}`;
}

function toModalities(language: string | null): Tool["modalities"] {
  if (!language) return ["text"];
  const l = language.toLowerCase();
  if (["python", "typescript", "javascript", "rust", "go", "java", "c++", "c", "ruby"].includes(l)) {
    return ["text", "code"];
  }
  return ["text"];
}

function toTool(repo: GhRepo, topic: string, now: Date): Tool {
  const description = (repo.description ?? "").slice(0, MAX_DESCRIPTION_LEN);
  const ossRepo = repo.url;
  const homepage = repo.homepage && repo.homepage.startsWith("http") ? repo.homepage : ossRepo;
  return {
    kind: "tool",
    id: slugify(repo.owner.login, repo.name),
    name: repo.name,
    vendor: repo.owner.login,
    category: TOPIC_TO_CATEGORY[topic] ?? "other",
    released: null,
    homepage,
    built_on_models: [],
    oss: true,
    oss_repo: ossRepo,
    pricing_tiers: [{ name: "Free", monthly_usd: 0, per_seat: false, notes: "Open source" }],
    free_tier: true,
    modalities: toModalities(repo.language),
    links: { homepage, ...(homepage !== ossRepo ? { docs: ossRepo } : {}) },
    tags: [topic, repo.language ? repo.language.toLowerCase() : null].filter((x): x is string => Boolean(x)),
    sources: [ossRepo],
    status: "ga",
  };
}

function searchTopic(topic: string): GhRepo[] {
  const args = [
    "search",
    "repos",
    "--topic", topic,
    "--sort", "stars",
    "--limit", String(PER_TOPIC_LIMIT),
    "--json", "name,owner,description,stargazersCount,url,homepage,updatedAt,license,language,isArchived",
  ];
  const raw = execSync(`gh ${args.map((a) => (a.includes(" ") ? `'${a}'` : a)).join(" ")}`, {
    encoding: "utf8",
  });
  return JSON.parse(raw) as GhRepo[];
}

export const githubTrending: Source = {
  id: "github-trending",
  description: "GitHub repo search — top OSS AI projects across ai-agent / agentic-ai / mcp-server topics.",
  trust: "supplementary",
  async run(ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    const seen = new Set<string>();
    const tools: Tool[] = [];

    for (const topic of TOPICS) {
      let repos: GhRepo[];
      try {
        repos = searchTopic(topic);
      } catch (err) {
        warnings.push(`gh search ${topic}: ${(err as Error).message.split("\n")[0]}`);
        continue;
      }
      for (const r of repos) {
        if (r.isArchived) continue;
        if (r.stargazersCount < MIN_STARS) continue;
        if (!r.description || !r.description.trim()) continue;
        const t = toTool(r, topic, ctx.now);
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        tools.push(t);
      }
    }

    return { source: "github-trending", tools, warnings, estimatedCostUsd: 0 };
  },
};
