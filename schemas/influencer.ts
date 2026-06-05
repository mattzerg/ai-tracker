import { z } from "zod";
import { url } from "./common.ts";

export const influencerCategorySchema = z.enum([
  "builder",        // ships code/tools that others build on
  "researcher",     // publishes papers, lab affiliation
  "founder",        // runs an AI company
  "operator",       // executes AI strategy at scale (not founder)
  "commentator",    // public analysis, no first-party lab/product
  "educator",       // teaches AI to others as primary output
]);

export const influencerSchema = z.object({
  kind: z.literal("influencer"),
  id: z.string().regex(/^[a-z0-9-]+$/, "lowercase-hyphenated slug"),
  name: z.string().min(1),
  handle: z.string().optional(),          // Twitter/X handle without @
  github_handle: z.string().optional(),
  category: influencerCategorySchema,
  role: z.string().min(1),                 // short title — "Anthropic CEO", "Author, Datasette"
  affiliation: z.string().nullable(),       // company or org, nullable for independents
  // Rough point-in-time follower/influence signals. NOT meant as a precise leaderboard
  // metric — meant as scale indicators. All optional; null means "unknown / declines to chart".
  twitter_followers: z.number().int().nonnegative().nullable().optional(),
  github_followers: z.number().int().nonnegative().nullable().optional(),
  followers_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional(),
  // Free-text "what they're known for in one sentence."
  known_for: z.string().min(1).max(280),
  sources: z.array(url).min(1),
  tags: z.array(z.string()).default([]),
});

export const influencerListSchema = z.object({
  kind: z.literal("influencer-list"),
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  influencers: z.array(influencerSchema),
});

export type Influencer = z.infer<typeof influencerSchema>;
export type InfluencerList = z.infer<typeof influencerListSchema>;
