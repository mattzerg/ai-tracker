import type { Repo } from "../../schemas/index.ts";
import { isJunkRepo } from "./sources/github-repos.ts";

// Auto-promotion bar for newly-discovered supplementary repos. Repos that clear
// this strict bar are written straight into the curated set during a normal
// `--apply --updates-only` run, instead of sitting in the human-review candidate
// queue. Everything that does NOT clear the bar still queues for review.
//
// The bar is deliberately conservative — its job is to widen coverage with repos
// that are unambiguously real AI infrastructure, not to replace human curation.
// Tuned to lift the tracked-repo count materially while keeping awesome-lists,
// toy projects, and stale repos out of the published set.

// Star floor for auto-promotion. Configurable so the bar can be tuned without a
// code change; defaults conservative (public dataset). 10k keeps the auto-set
// high-signal and comfortably past the coverage target.
const MIN_STARS = Number(process.env.AUTO_PROMOTE_MIN_STARS ?? 10_000);
const MAX_AGE_DAYS = 400; // pushed within ~13 months → actively maintained

// Optional cap: promote only the top-N by stars, queue the rest. Used to prove a
// small batch before mass production. Unset = no cap.
const PROMOTE_LIMIT = process.env.AUTO_PROMOTE_LIMIT ? Number(process.env.AUTO_PROMOTE_LIMIT) : undefined;

// Description-corroboration: GitHub topic tags are self-assigned and noisy, so a
// repo can be returned for an AI topic (e.g. "mcp") while being unrelated infra
// (an nginx UI, an ESP32 board). Require the description to actually mention an
// AI/LLM concept before auto-publishing. Repos that fail this still go to the
// human-review queue — they are not discarded.
const AI_CORROBORATION = new RegExp(
  [
    "\\bai\\b", "\\ba\\.i\\.", "artificial intelligence", "\\bml\\b", "machine learning",
    "\\bllm", "large language model", "language model", "gpt", "transformer", "diffusion",
    "\\bagent", "agentic", "chatbot", "copilot", "assistant",
    "\\brag\\b", "retrieval[- ]augmented", "embedding", "vector (db|database|search|store)",
    "\\bmcp\\b", "model context protocol", "prompt", "inference", "fine[- ]tun",
    "neural", "openai", "anthropic", "claude", "gemini", "llama", "mistral", "deepseek",
    "langchain", "semantic search", "knowledge base", "text-to-", "speech-to-", "multimodal",
    "generative", "foundation model", "reasoning", "completetion|completion",
  ].join("|"),
  "i",
);

export function descriptionCorroboratesAI(description: string | null): boolean {
  return Boolean(description && AI_CORROBORATION.test(description));
}

// Promotion-only junk: stricter than the discovery junk filter. Catches
// educational / list / reference content that self-tags AI topics and clears the
// star bar (interview guides, prompt collections, study notes, awesome-lists),
// which should never auto-publish as infrastructure. Matches name OR description,
// including common CJK markers (面试 = interview, 指南/教程 = guide/tutorial).
const PROMOTE_JUNK = new RegExp(
  [
    "guide", "handbook", "awesome", "cheat[- ]?sheet", "roadmap", "interview",
    "tutorial", "bootcamp", "\\bcourse\\b", "study", "\\bnotes?\\b", "examples?",
    "list of", "collection of", "curated", "resources", "prompts?\\b",
    "面试", "指南", "教程", "笔记", "学习",
  ].join("|"),
  "i",
);

export function isPromotionJunk(name: string, description: string | null): boolean {
  if (PROMOTE_JUNK.test(name)) return true;
  if (description && PROMOTE_JUNK.test(description)) return true;
  return false;
}

export interface AutoPromoteOptions {
  now?: Date;
}

export function autoPromoteRepo(r: Repo, opts: AutoPromoteOptions = {}): boolean {
  const now = opts.now ?? new Date();

  if (r.archived) return false;
  // "other" means no known topic→category mapping fired — too ambiguous to
  // auto-publish; leave for human review.
  if (r.category === "other") return false;
  if ((r.stars ?? 0) < MIN_STARS) return false;
  // Open-source signal: a recognized license. Unlicensed/abandoned repos queue.
  if (!r.license) return false;
  if (!r.description?.trim()) return false;
  if (isJunkRepo(r.name, r.description)) return false;
  // Stricter promotion gate: reject educational/list/reference content.
  if (isPromotionJunk(r.name, r.description)) return false;
  // Cut topic mis-tags: the description must corroborate that this is AI infra.
  if (!descriptionCorroboratesAI(r.description)) return false;

  if (!r.pushed_at) return false;
  const pushed = Date.parse(`${r.pushed_at}T00:00:00Z`);
  if (Number.isNaN(pushed)) return false;
  const ageDays = (now.getTime() - pushed) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) return false;

  return true;
}

// Split newly-added repos into auto-promoted vs. queued. When AUTO_PROMOTE_LIMIT
// is set, only the top-N eligible repos by stars are promoted (small-batch proof);
// the remaining eligible ones fall back to the queue.
export function partitionAutoPromote(repos: Repo[], opts: AutoPromoteOptions = {}): { promote: Repo[]; queue: Repo[] } {
  const eligible: Repo[] = [];
  const queue: Repo[] = [];
  for (const r of repos) (autoPromoteRepo(r, opts) ? eligible : queue).push(r);

  if (PROMOTE_LIMIT == null || eligible.length <= PROMOTE_LIMIT) {
    return { promote: eligible, queue };
  }
  // Cap: keep the top-N by stars, push the overflow back to the review queue.
  const sorted = eligible.slice().sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  return { promote: sorted.slice(0, PROMOTE_LIMIT), queue: [...queue, ...sorted.slice(PROMOTE_LIMIT)] };
}
