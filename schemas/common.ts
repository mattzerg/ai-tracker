import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const url = z.string().url();

export const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase alnum with - or _");

export const entityId = z
  .string()
  .regex(
    /^[a-z0-9-]+(__[a-z0-9][a-z0-9._-]*)?$/,
    "format: <provider>__<id> for models, <slug> for tools",
  );
