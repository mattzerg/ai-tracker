import { z } from "zod";
import { entityId, isoDate, url } from "./common.ts";

export const eventTypeSchema = z.enum([
  "released",
  "price_change",
  "deprecated",
  "capability_added",
  "benchmark_update",
  "license_change",
  "model_swap",
  "shut_down",
  "rebrand",
  "acquired",
]);

const deltaSchema = z.object({
  field: z.string().min(1),
  from: z.unknown().nullable(),
  to: z.unknown().nullable(),
});

const analystNoteSchema = z.object({
  author: z.string().min(1),
  date: isoDate,
  text: z.string().min(1).max(800),
});

export const eventSchema = z.object({
  date: isoDate,
  entity: entityId,
  type: eventTypeSchema,
  summary: z.string().min(1).max(280),
  delta: deltaSchema.optional(),
  source: url,
  submitted_by: z
    .string()
    .regex(/^(ingest-bot|user:[a-f0-9]{8,}|matt)$/, "ingest-bot | user:<hash> | matt"),
  // Optional 1-paragraph editorial take. Filled by hand for major events only.
  // Distinguishes ai-tracker from auto-aggregated competitors.
  analyst_note: analystNoteSchema.optional(),
});

export type Event = z.infer<typeof eventSchema>;
