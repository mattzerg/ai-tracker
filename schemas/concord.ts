import { z } from "zod";
import { entityId } from "./common.ts";

// Concord is Zerg's internal strategic-bargaining game played BETWEEN model agents.
// 6 houses with persona-specific victory conditions; 4-round matches; LLM-vs-LLM.
// See ~/concord/ for the engine; this schema describes the aggregate signal that
// flows into ai-tracker, NOT individual match records.

const concordModelEntrySchema = z.object({
  // The model id as used by the Concord engine (e.g., "claude-opus-4-7", "gpt-4o").
  concord_model_id: z.string().min(1),
  // The matching ai-tracker model id if one exists. Many Concord-tracked models
  // are also in the main catalog; some (older or local dev) are not.
  tracker_model_id: entityId.nullable(),
  matches_played: z.number().int().nonnegative(),
  victories_achieved: z.number().int().nonnegative(),
  victory_rate: z.number().min(0).max(1),
  survival_rate: z.number().min(0).max(1),
  avg_territories_at_end: z.number().nonnegative(),
  houses_played: z.record(z.string(), z.number().int().nonnegative()),
});

export const concordSummarySchema = z.object({
  kind: z.literal("concord-summary"),
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  matches_total: z.number().int().nonnegative(),
  latest_match_started_at: z.string().datetime().nullable(),
  rule_version: z.string().min(1),
  source_engine: z.string().min(1),
  models: z.array(concordModelEntrySchema),
});

export type ConcordSummary = z.infer<typeof concordSummarySchema>;
export type ConcordModelEntry = z.infer<typeof concordModelEntrySchema>;
