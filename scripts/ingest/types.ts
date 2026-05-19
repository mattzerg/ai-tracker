import type { Event, Model, Repo, Tool } from "../../schemas/index.ts";

export type SourceTrust = "authoritative" | "supplementary";

export interface SourceContext {
  now: Date;
  /** True when the runner is in dry-run mode — readers should still fetch but never write to disk. */
  dryRun: boolean;
}

export interface SourceResult {
  /** Identifier of the source (e.g. "openrouter", "anthropic-news"). */
  source: string;
  /** Discovered model entries (full schema-conformant JSON). May overlap with existing data — diffing happens later. */
  models?: Model[];
  /** Discovered tool entries. */
  tools?: Tool[];
  /** Discovered GitHub repo entries. */
  repos?: Repo[];
  /** Discovered events (release / price-change / etc). */
  events?: Event[];
  /** Source-side warnings: rate-limited, partial data, parse anomalies. Surfaced in PR body, never fail the run. */
  warnings?: string[];
  /** USD spent calling LLMs from this source. 0 for pure-API readers. */
  estimatedCostUsd?: number;
}

export interface Source {
  /** Stable id, used as the tmp/<id>.json snapshot filename. */
  id: string;
  /** One-line description for the PR body and CLI output. */
  description: string;
  /** "authoritative" for provider docs/news; "supplementary" for aggregators (OpenRouter, HF leaderboards). */
  trust: SourceTrust;
  /** Run the source. Must be idempotent and side-effect-free except for tmp/ snapshots. */
  run(ctx: SourceContext): Promise<SourceResult>;
}
