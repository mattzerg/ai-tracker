import { z } from "zod";
import { entityId, isoDate, url } from "./common.ts";
import { signalsSchema } from "./signals.ts";

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

// Benchmarks accept arbitrary string keys with numeric values. Standard benchmarks
// (mmlu, humaneval, swe_bench, gpqa) are 0-1 fractions. Arena Elo is an int.
// Provider-bespoke benchmarks (cursorbench, xbow_visual_acuity, gdpval_aa, etc.)
// also welcome — providers often publish their own evals before academic ones.
// The renderer formats by heuristic (>1 = score, ≤1 = fraction).
export const modelBenchmarksSchema = z.record(z.string(), z.number());

export const modelSchema = z.object({
  kind: z.literal("model"),
  id: entityId,
  name: z.string().min(1),
  provider: z.string().min(1),
  released: isoDate.nullable(),
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
  signals: signalsSchema.optional(),
});

export type Model = z.infer<typeof modelSchema>;
