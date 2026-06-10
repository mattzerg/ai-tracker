import { z } from "zod";

// Public-safe signal data attached to a tracked entity. This is the reference /
// quality-signal layer: who has mentioned, used, bookmarked, or shared an
// entity, distilled into a score + counts + PUBLIC mentions.
//
// PRIVACY CONTRACT: raw personal context (who-is-Matt, email/message bodies,
// private bookmarks) NEVER appears here. The local miner (scripts/signals/)
// enforces the split — only the aggregate score, per-type counts, and mentions
// that are themselves public (newsletters, public posts) are written to
// data/signals/index.json and published. Private raw mentions stay in a local
// sqlite that is never committed.

export const signalMentionSchema = z.object({
  // Provenance of the reference, e.g. "newsletter:the-neuron", "github",
  // "influencer:karpathy", "bookmark". Personal-identifying detail is excluded.
  source: z.string().min(1),
  // What kind of reference: bookmarked | shared | mentioned | used | newsletter | influencer.
  type: z.string().min(1),
  ts: z.string().optional(), // ISO date of the reference
  url: z.string().optional(), // public link when available
});
export type SignalMention = z.infer<typeof signalMentionSchema>;

export const signalsSchema = z.object({
  // 0-100 composite (scripts/signals/score.ts): weighted, recency-decayed.
  signal_score: z.number().min(0),
  // Count of references by signal type (bookmarked, newsletter, influencer, …).
  counts: z.record(z.string(), z.number()).default({}),
  // Public-safe references (capped/sampled by the miner).
  mentions: z.array(signalMentionSchema).default([]),
  updated_at: z.string().optional(),
});
export type Signals = z.infer<typeof signalsSchema>;

// data/signals/index.json contract: entity id → signal summary. Consumed by the
// signals ingest source; produced by the local miner.
export const signalsIndexSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  entities: z.record(z.string(), signalsSchema),
});
export type SignalsIndex = z.infer<typeof signalsIndexSchema>;
