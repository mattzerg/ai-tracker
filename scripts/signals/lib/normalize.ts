import type { Model, Repo, Tool } from "../../../schemas/index.ts";

// Normalization: map free text / URLs from raw sources (newsletters, bookmarks)
// onto tracked entity ids. Two jobs:
//   1. name-mention extraction — count whole-word mentions of an entity's name
//   2. URL → entity id — parse github/HF/vendor links to ids (matched or new)

// Generic words that collide with real language — never treat as an entity name
// even if some entity is named that. Keeps newsletter prose from false-matching.
const STOPWORDS = new Set([
  "math", "compare", "code", "chat", "search", "vision", "agent", "agents", "cursor",
  "notion", "comet", "flow", "v0", "operator", "browser", "windsurf",
]);

export interface AliasIndex {
  // normalized alias → entity id (longest-alias-wins handled at build time)
  byAlias: Map<string, string>;
  // entity id → kind, for output bucketing
  kindOf: Map<string, "model" | "tool" | "repo">;
}

function aliasesFor(name: string): string[] {
  const out = new Set<string>();
  const cleaned = name.replace(/^[A-Za-z][A-Za-z0-9 ]*?:\s*/, "").trim(); // drop "Vendor: " prefix
  out.add(cleaned);
  out.add(name.trim());
  return [...out].filter((a) => a.length >= 4 && !STOPWORDS.has(a.toLowerCase()));
}

export function buildAliasIndex(models: Model[], tools: Tool[], repos: Repo[]): AliasIndex {
  const byAlias = new Map<string, string>();
  const kindOf = new Map<string, "model" | "tool" | "repo">();
  const add = (id: string, name: string, kind: "model" | "tool" | "repo") => {
    kindOf.set(id, kind);
    for (const a of aliasesFor(name)) {
      const key = a.toLowerCase();
      // longest alias wins on collision (more specific)
      const prev = byAlias.get(key);
      if (!prev || a.length > (prev.length ?? 0)) byAlias.set(key, id);
    }
  };
  for (const m of models) add(m.id, m.name, "model");
  for (const t of tools) add(t.id, t.name, "tool");
  // Repos use full_name's repo part as a name alias (e.g. "langchain", "vllm").
  for (const r of repos) add(r.id, r.name, "repo");
  return { byAlias, kindOf };
}

// Count whole-word, case-insensitive mentions of each alias in text.
export function extractMentions(text: string, index: AliasIndex): Map<string, number> {
  const hits = new Map<string, number>();
  for (const [alias, id] of index.byAlias) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const n = (text.match(re) || []).length;
    if (n > 0) hits.set(id, (hits.get(id) ?? 0) + n);
  }
  return hits;
}

// Parse a GitHub URL → tracker repo id (mirrors github-repos.ts repoId()).
export function githubUrlToRepoId(url: string): string | null {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  const tail = `${m[1]}_${m[2]}`.toLowerCase().replace(/\.git$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `github__${tail}`;
}

// Strip HTML to plain text for mention scanning.
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

// Extract all GitHub repo URLs from text (for discovery).
export function githubUrlsIn(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/github\.com\/[^/\s"'<>)]+\/[^/\s"'<>)]+/gi)).map((m) => m[0]);
}
