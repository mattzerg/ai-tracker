import { z } from "zod";
import { entityId, isoDate, url } from "./common.ts";

export const repoCategorySchema = z.enum([
  "agent-framework",
  "mcp",
  "rag",
  "eval",
  "vector-db",
  "coding-agent",
  "browser-automation",
  "workflow-automation",
  "inference",
  "local-models",
  "observability",
  "data",
  "ui",
  "other",
]);

export const repoSchema = z.object({
  kind: z.literal("repo"),
  id: entityId,
  owner: z.string().min(1),
  name: z.string().min(1),
  full_name: z.string().regex(/^[^/]+\/[^/]+$/, "expected owner/name"),
  description: z.string().nullable(),
  category: repoCategorySchema,
  language: z.string().nullable(),
  license: z.string().nullable(),
  stars: z.number().int().nonnegative().nullable().default(null),
  forks: z.number().int().nonnegative().nullable().default(null),
  open_issues: z.number().int().nonnegative().nullable().optional(),
  topics: z.array(z.string()).default([]),
  homepage: url.nullable().optional(),
  repo_url: url,
  package_urls: z.array(url).default([]),
  created_at: isoDate.nullable(),
  pushed_at: isoDate.nullable(),
  archived: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  sources: z.array(url).min(1),
});

export type Repo = z.infer<typeof repoSchema>;
