import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { loadModels, loadRepos, loadTools } from "../../src/lib/data.ts";
import { signalsIndexSchema, type Signals } from "../../schemas/index.ts";
import { buildAliasIndex, extractMentions, githubUrlToRepoId, githubUrlsIn, htmlToText } from "./lib/normalize.ts";
import { scoreMentions, type RawMention } from "./lib/score.ts";

// Local signal miner. Reads personal/public corpora, normalizes references onto
// tracked entity ids, scores them, and writes:
//   • data/signals/index.json        — PUBLIC: score + counts + public mentions
//   • data/signals/discovery-queue.json — referenced-but-untracked → candidates
//   • ~/.local/share/zerg/ai-tracker-signals/raw.json — PRIVATE: full raw mentions
//
// PRIVACY SPLIT: only public-source references (newsletters) appear in the public
// index's mentions[]. Personal references (bookmarks) contribute to aggregate
// counts only — their evidence stays in the private file, never committed.
//
// Runs LOCALLY (not in CI): it touches ~/.cache and ~/.local. The committed
// index.json is what the nightly `signals` ingest source consumes.

const REPO = resolve(import.meta.dirname, "../..");
const NEWSLETTER_CACHE = resolve(homedir(), ".cache/ai-tracker-signals/newsletters");
const SNIPPETS_FILE = resolve(homedir(), ".cache/ai-tracker-signals/snippets.json");
const IG_BOOKMARKS = resolve(homedir(), ".cache/ig-mining/bookmarks.json");
const PRIVATE_OUT = resolve(homedir(), ".local/share/zerg/ai-tracker-signals/raw.json");
const PUBLIC_INDEX = resolve(REPO, "data/signals/index.json");
const DISCOVERY_OUT = resolve(REPO, "data/signals/discovery-queue.json");

// Fixed "now" via env for deterministic/testable runs; Date is fine in a local CLI.
const NOW = new Date(process.env.SIGNALS_NOW ?? new Date().toISOString());

interface Agg {
  raw: (RawMention & { source: string; url?: string; public: boolean })[];
}

function newsletterSourceId(sender: string): string {
  if (/theneuron/i.test(sender)) return "newsletter:the-neuron";
  if (/aicorner/i.test(sender)) return "newsletter:the-ai-corner";
  const host = sender.split("@")[1]?.split(".")[0] ?? "newsletter";
  return `newsletter:${host}`;
}

// Sanitize a source label for PUBLIC output. Public sources (newsletters) pass
// through; personal/private sources (bookmarks, messages) are generalized to
// "curated" so the committed discovery queue never reveals personal provenance.
function publicSourceLabel(source: string): string {
  return source.startsWith("newsletter:") ? source : "curated";
}

function bump(map: Map<string, Agg>, id: string, m: Agg["raw"][number]): void {
  let a = map.get(id);
  if (!a) { a = { raw: [] }; map.set(id, a); }
  a.raw.push(m);
}

function main(): void {
  const models = loadModels();
  const tools = loadTools();
  const repos = loadRepos();
  const trackedIds = new Set([...models, ...tools, ...repos].map((e) => e.id));
  const aliasIndex = buildAliasIndex(models, tools, repos);

  const agg = new Map<string, Agg>();
  const discovery = new Map<string, { url: string; repo_id: string; count: number; sources: Set<string> }>();
  const addDiscovery = (url: string, source: string) => {
    const id = githubUrlToRepoId(url);
    if (!id || trackedIds.has(id)) return; // already tracked → not a candidate
    const d = discovery.get(id) ?? { url, repo_id: id, count: 0, sources: new Set<string>() };
    d.count++; d.sources.add(source); discovery.set(id, d);
  };

  // ---- Newsletter miner (PUBLIC source) — full bodies (high weight) ----
  let newsletterFiles = 0;
  const minedKeys = new Set<string>(); // sender|date already mined from a full body
  if (existsSync(NEWSLETTER_CACHE)) {
    for (const f of readdirSync(NEWSLETTER_CACHE).filter((f) => f.endsWith(".json"))) {
      let doc: { messages?: { htmlBody?: string; plaintextBody?: string; sender?: string; date?: string }[] };
      try { doc = JSON.parse(readFileSync(resolve(NEWSLETTER_CACHE, f), "utf8")); } catch { continue; }
      for (const msg of doc.messages ?? []) {
        const text = htmlToText(msg.htmlBody || msg.plaintextBody || "");
        if (!text.trim()) continue;
        newsletterFiles++;
        const src = newsletterSourceId(msg.sender ?? "");
        const ts = (msg.date ?? "").slice(0, 10) || undefined;
        minedKeys.add(`${src}|${ts ?? ""}`);
        for (const [id, count] of extractMentions(text, aliasIndex)) {
          bump(agg, id, { type: "newsletter", ts, weightHint: Math.min(count, 5), source: src, public: true });
        }
        for (const url of githubUrlsIn(text)) addDiscovery(url, src);
      }
    }
  }

  // ---- Newsletter snippet miner (PUBLIC) — subject+preview for the wider corpus
  // we didn't pull full bodies for. Lower weight (headline-level signal). Skips
  // any (sender,date) already mined from a full body to avoid double-counting.
  let snippetCount = 0;
  if (existsSync(SNIPPETS_FILE)) {
    let snips: { date?: string; sender?: string; subject?: string; snippet?: string }[] = [];
    try { snips = JSON.parse(readFileSync(SNIPPETS_FILE, "utf8")); } catch { /* ignore */ }
    for (const s of snips) {
      const src = newsletterSourceId(s.sender ?? "");
      const ts = (s.date ?? "").slice(0, 10) || undefined;
      if (minedKeys.has(`${src}|${ts ?? ""}`)) continue; // body already counted
      const text = `${s.subject ?? ""} ${s.snippet ?? ""}`;
      if (!text.trim()) continue;
      snippetCount++;
      for (const [id] of extractMentions(text, aliasIndex)) {
        bump(agg, id, { type: "newsletter", ts, weightHint: 1, source: src, public: true });
      }
    }
  }

  // ---- IG bookmarks miner (PERSONAL source — counts public, evidence private) ----
  let bookmarkHits = 0;
  if (existsSync(IG_BOOKMARKS)) {
    let bms: { url?: string; title?: string; year?: number; folder?: string }[] = [];
    try { bms = JSON.parse(readFileSync(IG_BOOKMARKS, "utf8")); } catch { /* ignore */ }
    for (const b of bms) {
      if (!b.url) continue;
      const id = githubUrlToRepoId(b.url);
      if (!id) continue;
      if (trackedIds.has(id)) {
        bookmarkHits++;
        bump(agg, id, { type: "bookmarked", ts: b.year ? String(b.year) : undefined, source: "instagram", url: b.url, public: false });
      } else {
        addDiscovery(b.url, "instagram-bookmark");
      }
    }
  }

  // ---- Aggregate → public index + private raw ----
  const publicEntities: Record<string, Signals> = {};
  const privateRaw: Record<string, unknown> = {};
  for (const [id, a] of agg) {
    const counts: Record<string, number> = {};
    for (const m of a.raw) counts[m.type] = (counts[m.type] ?? 0) + 1;
    const signal_score = scoreMentions(a.raw, NOW);
    // Public mentions: only public-source references, capped + de-duped.
    const pub = a.raw.filter((m) => m.public);
    const mentions = dedupePublic(pub).slice(0, 8).map((m) => ({ source: m.source, type: m.type, ts: m.ts, url: m.url }));
    publicEntities[id] = { signal_score, counts, mentions, updated_at: NOW.toISOString().slice(0, 10) };
    privateRaw[id] = a.raw; // full evidence incl. personal — stays local
  }

  // Validate the public contract before writing.
  const index = signalsIndexSchema.parse({ schema_version: 1, generated_at: NOW.toISOString(), entities: publicEntities });
  mkdirSync(resolve(REPO, "data/signals"), { recursive: true });
  writeFileSync(PUBLIC_INDEX, JSON.stringify(index, null, 2) + "\n");

  const candidates = [...discovery.values()]
    .sort((a, b) => b.count - a.count)
    .map((d) => ({
      type: "repo",
      url: d.url,
      repo_id: d.repo_id,
      reference_count: d.count,
      // Sanitize provenance: newsletters stay, personal sources → "curated".
      sources: [...new Set([...d.sources].map(publicSourceLabel))],
    }));
  writeFileSync(DISCOVERY_OUT, JSON.stringify({ schema_version: 1, generated_at: NOW.toISOString(), candidates }, null, 2) + "\n");

  mkdirSync(resolve(PRIVATE_OUT, ".."), { recursive: true });
  writeFileSync(PRIVATE_OUT, JSON.stringify({ generated_at: NOW.toISOString(), raw: privateRaw }, null, 2) + "\n");

  console.log(`signal miner complete:`);
  console.log(`  newsletters scanned : ${newsletterFiles} full + ${snippetCount} snippet(s)`);
  console.log(`  bookmark hits       : ${bookmarkHits} (matched tracked repos)`);
  console.log(`  entities scored     : ${Object.keys(publicEntities).length} → ${PUBLIC_INDEX}`);
  console.log(`  discovery candidates: ${candidates.length} → ${DISCOVERY_OUT}`);
  console.log(`  private raw         : ${PRIVATE_OUT} (NOT committed)`);
  const top = Object.entries(publicEntities).sort((a, b) => b[1].signal_score - a[1].signal_score).slice(0, 10);
  console.log(`  top signals:`);
  for (const [id, s] of top) console.log(`    ${String(s.signal_score).padStart(3)}  ${id}  ${JSON.stringify(s.counts)}`);
}

function dedupePublic(raw: { source: string; type: string; ts?: string; url?: string; public: boolean }[]): typeof raw {
  const seen = new Set<string>();
  const out: typeof raw = [];
  for (const m of raw) {
    const k = `${m.source}|${m.ts ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

main();
