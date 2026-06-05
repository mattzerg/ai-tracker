// GitHub repo catalog source. Unlike github-trending.ts, this writes first-class
// repo records instead of converting repos into tools.

import { execFileSync } from "node:child_process";
import type { Repo } from "../../../schemas/index.ts";
import { loadRepos } from "../../../src/lib/data.ts";
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
  url: string;
}

interface GhApiRepo {
  archived: boolean;
  created_at: string;
  description: string | null;
  forks_count: number;
  full_name: string;
  homepage: string | null;
  html_url: string;
  language: string | null;
  license: { key?: string; name?: string } | null;
  open_issues_count: number;
  pushed_at: string | null;
  stargazers_count: number;
  topics?: string[];
}

const TOPIC_TO_CATEGORY: Record<string, Repo["category"]> = {
  "ai-agent": "agent-framework",
  "agentic-ai": "agent-framework",
  "mcp-server": "mcp",
  "model-context-protocol": "mcp",
  "rag": "rag",
  "vector-database": "vector-db",
  "ai-evaluation": "eval",
  "code-interpreter": "coding-agent",
  "browser-automation": "browser-automation",
};

const TOPICS = [
  "ai-agent",
  "agentic-ai",
  "mcp-server",
  "model-context-protocol",
  "rag",
  "vector-database",
  "ai-evaluation",
  "code-interpreter",
  "browser-automation",
];
const MIN_STARS = 1000;
const PER_TOPIC_LIMIT = 35;

// Educational / list-style repos rank high on stars but aren't AI infrastructure —
// awesome-lists, tutorials, interview prep, and курс-style content pollute the
// candidate queue (docs/follow-ups.md "Repo candidate category mis-classification").
// Conservative: name patterns are anchored where possible so real infra
// (e.g. "langchain", "guidance") doesn't false-match.
const JUNK_NAME_PATTERN = new RegExp(
  [
    /^awesome[-_]/, /[-_]awesome$/,
    /^learn[-_]/, /[-_]learn$/,
    /tutorial/, /for[-_]beginners/, /best[-_]practices?$/,
    /checklist/, /^course[-_]/, /[-_]course$/, /interview/,
    /roadmap/, /cheat[-_]?sheets?$/, /[-_]examples?$/, /[-_]guide$/, /^guide[-_]/,
  ].map((r) => r.source).join("|"),
  "i",
);

const JUNK_DESCRIPTION_PATTERN = new RegExp(
  [
    /curated list/, /awesome list/, /list of awesome/,
    /collection of (links|resources|tutorials|examples|papers)/,
    /step[- ]by[- ]step (guide|tutorial)/,
    /interview (questions|prep)/,
    /learning (path|roadmap)/,
    /\bcourse\b.*\b(beginners|lessons)\b/,
  ].map((r) => r.source).join("|"),
  "i",
);

/** True when a repo is educational/list-style content rather than AI infrastructure. */
export function isJunkRepo(name: string, description: string | null): boolean {
  if (JUNK_NAME_PATTERN.test(name)) return true;
  if (description && JUNK_DESCRIPTION_PATTERN.test(description)) return true;
  return false;
}

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function repoId(owner: string, name: string): string {
  const tail = `${owner}_${name}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `github__${tail}`;
}

function categoryFor(topic: string): Repo["category"] {
  return TOPIC_TO_CATEGORY[topic] ?? "other";
}

function toRepo(repo: GhRepo, topic: string): Repo {
  const homepage = repo.homepage && repo.homepage.startsWith("http") ? repo.homepage : undefined;
  const language = repo.language || null;
  const license = repo.license?.name || repo.license?.key || null;
  return {
    kind: "repo",
    id: repoId(repo.owner.login, repo.name),
    owner: repo.owner.login,
    name: repo.name,
    full_name: `${repo.owner.login}/${repo.name}`,
    description: repo.description?.trim() || null,
    category: categoryFor(topic),
    language,
    license,
    stars: repo.stargazersCount,
    forks: null,
    topics: [topic],
    homepage,
    repo_url: repo.url,
    package_urls: [],
    created_at: null,
    pushed_at: null,
    archived: repo.isArchived,
    tags: [topic, language ? language.toLowerCase() : null].filter((x): x is string => Boolean(x)),
    sources: [repo.url],
  };
}

function toRepoFromApi(repo: GhApiRepo, existing: Repo): Repo {
  const [owner, name] = repo.full_name.split("/");
  const homepage = repo.homepage && repo.homepage.startsWith("http") ? repo.homepage : existing.homepage;
  const language = repo.language || existing.language || null;
  const license = repo.license?.name || repo.license?.key || existing.license || null;
  return {
    ...existing,
    owner: owner || existing.owner,
    name: name || existing.name,
    full_name: repo.full_name || existing.full_name,
    description: repo.description?.trim() || existing.description,
    language,
    license,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    open_issues: repo.open_issues_count,
    topics: repo.topics?.length ? repo.topics : existing.topics,
    homepage,
    repo_url: repo.html_url || existing.repo_url,
    created_at: dateOnly(repo.created_at),
    pushed_at: dateOnly(repo.pushed_at),
    archived: repo.archived,
    tags: Array.from(new Set([
      ...existing.tags,
      ...(repo.topics ?? []),
      language ? language.toLowerCase() : null,
    ].filter((x): x is string => Boolean(x)))),
    sources: Array.from(new Set([repo.html_url || existing.repo_url, ...existing.sources])),
  };
}

function fetchRepo(fullName: string): GhApiRepo {
  const raw = execFileSync("gh", ["api", `repos/${fullName}`], { encoding: "utf8" });
  return JSON.parse(raw) as GhApiRepo;
}

function searchTopic(topic: string): GhRepo[] {
  const args = [
    "search",
    "repos",
    "--topic", topic,
    "--sort", "stars",
    "--limit", String(PER_TOPIC_LIMIT),
    "--json", "name,owner,description,stargazersCount,url,homepage,license,language,isArchived",
  ];
  const raw = execFileSync("gh", args, { encoding: "utf8" });
  return JSON.parse(raw) as GhRepo[];
}

export const githubRepos: Source = {
  id: "github-repos",
  description: "GitHub repo search — first-class AI repo catalog across agent, MCP, RAG, coding, and browser automation topics.",
  trust: "supplementary",
  async run(_ctx: SourceContext): Promise<SourceResult> {
    const warnings: string[] = [];
    const seen = new Set<string>();
    const repos: Repo[] = [];

    for (const existing of loadRepos()) {
      try {
        const repo = toRepoFromApi(fetchRepo(existing.full_name), existing);
        repos.push(repo);
        seen.add(repo.id);
      } catch (err) {
        warnings.push(`gh api ${existing.full_name}: ${(err as Error).message.split("\n")[0]}`);
      }
    }

    for (const topic of TOPICS) {
      let result: GhRepo[];
      try {
        result = searchTopic(topic);
      } catch (err) {
        warnings.push(`gh search ${topic}: ${(err as Error).message.split("\n")[0]}`);
        continue;
      }
      for (const r of result) {
        if (r.isArchived) continue;
        if (r.stargazersCount < MIN_STARS) continue;
        if (!r.description?.trim()) continue;
        if (isJunkRepo(r.name, r.description)) continue;
        let repo = toRepo(r, topic);
        if (seen.has(repo.id)) continue;
        try {
          repo = toRepoFromApi(fetchRepo(repo.full_name), repo);
        } catch (err) {
          warnings.push(`gh api ${repo.full_name}: ${(err as Error).message.split("\n")[0]}`);
        }
        if (repo.archived) continue;
        seen.add(repo.id);
        repos.push(repo);
      }
    }

    return { source: "github-repos", repos, warnings, estimatedCostUsd: 0 };
  },
};
