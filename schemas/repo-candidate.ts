import { z } from "zod";
import { repoSchema } from "./repo.ts";

export const repoCandidateQueueSchema = z.object({
  kind: z.literal("repo-candidate-queue"),
  source: z.string().min(1),
  generated_at: z.string().datetime(),
  candidates: z.array(repoSchema),
});

export type RepoCandidateQueue = z.infer<typeof repoCandidateQueueSchema>;
