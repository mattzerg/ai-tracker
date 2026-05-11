import { z } from "zod";
import { entityId, isoDate, slug, url } from "./common.ts";

export const toolCategorySchema = z.enum([
  "ide",
  "agent-framework",
  "chat",
  "image-gen",
  "video-gen",
  "audio-gen",
  "voice",
  "search",
  "rag",
  "vector-db",
  "eval",
  "monitoring",
  "scraping",
  "browser-automation",
  "research",
  "writing",
  "code-review",
  "data-analysis",
  "spreadsheet",
  "presentation",
  "design",
  "marketing",
  "sales",
  "support",
  "ops",
  "other",
]);

export const toolPricingTierSchema = z.object({
  name: z.string().min(1),
  monthly_usd: z.number().nonnegative().nullable(),
  annual_usd: z.number().nonnegative().nullable().optional(),
  per_seat: z.boolean().default(false),
  notes: z.string().optional(),
});

export const toolSchema = z.object({
  kind: z.literal("tool"),
  id: slug,
  name: z.string().min(1),
  vendor: z.string().min(1),
  category: toolCategorySchema,
  released: isoDate.nullable(),
  built_on_models: z.array(entityId).default([]),
  oss: z.boolean(),
  oss_repo: url.optional(),
  pricing_tiers: z.array(toolPricingTierSchema).default([]),
  free_tier: z.boolean(),
  modalities: z
    .array(z.enum(["text", "vision", "audio", "video", "image", "code"]))
    .default(["text"]),
  links: z.object({
    homepage: url,
    docs: url.optional(),
    pricing: url.optional(),
    changelog: url.optional(),
  }),
  tags: z.array(z.string()).default([]),
  sources: z.array(url).min(1),
  status: z.enum(["beta", "ga", "deprecated", "shut-down"]).default("ga"),
});

export type Tool = z.infer<typeof toolSchema>;
