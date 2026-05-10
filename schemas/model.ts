import { z } from "zod";
import { entityId, isoDate, url } from "./common.ts";

export const modalitySchema = z.enum([
  "text",
  "vision",
  "audio",
  "video",
  "image-gen",
  "embedding",
  "code",
]);

export const licenseSchema = z.enum([
  "proprietary",
  "open-weights",
  "apache-2.0",
  "mit",
  "llama-community",
  "gemma",
  "other",
]);

export const modelPricingSchema = z.object({
  input_per_mtok: z.number().nonnegative().nullable(),
  output_per_mtok: z.number().nonnegative().nullable(),
  cached_input_per_mtok: z.number().nonnegative().nullable().optional(),
  as_of: isoDate,
});

export const modelBenchmarksSchema = z
  .object({
    mmlu: z.number().min(0).max(1).optional(),
    humaneval: z.number().min(0).max(1).optional(),
    swe_bench: z.number().min(0).max(1).optional(),
    gpqa: z.number().min(0).max(1).optional(),
    arena_elo: z.number().int().optional(),
    aider_polyglot: z.number().min(0).max(1).optional(),
  })
  .partial();

export const modelSchema = z.object({
  kind: z.literal("model"),
  id: entityId,
  name: z.string().min(1),
  provider: z.string().min(1),
  released: isoDate,
  context_window: z.number().int().positive().nullable(),
  output_window: z.number().int().positive().nullable().optional(),
  modalities: z.array(modalitySchema).min(1),
  license: licenseSchema,
  pricing: modelPricingSchema.nullable(),
  benchmarks: modelBenchmarksSchema.optional(),
  links: z.object({
    homepage: url.optional(),
    docs: url.optional(),
    card: url.optional(),
    paper: url.optional(),
  }),
  tags: z.array(z.string()).default([]),
  sources: z.array(url).min(1, "every entry needs at least one source"),
  status: z.enum(["preview", "ga", "deprecated", "retired"]).default("ga"),
});

export type Model = z.infer<typeof modelSchema>;
