import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { repoCandidateQueueSchema, type Repo } from "../../schemas/index.ts";
import { writeRepoCandidateQueue } from "./writer.ts";

const roots: string[] = [];

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ai-tracker-writer-"));
  roots.push(root);
  return root;
}

function repo(id: string, stars: number): Repo {
  const fullName = `owner/${id}`;
  return {
    kind: "repo",
    id: `github__owner_${id}`,
    owner: "owner",
    name: id,
    full_name: fullName,
    description: `${id} repo`,
    category: "other",
    language: null,
    license: null,
    stars,
    forks: null,
    open_issues: null,
    topics: [],
    homepage: null,
    repo_url: `https://github.com/${fullName}`,
    package_urls: [],
    created_at: null,
    pushed_at: null,
    archived: false,
    tags: [],
    sources: [`https://github.com/${fullName}`],
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("writeRepoCandidateQueue", () => {
  it("retains existing unreviewed candidates when a later run writes the same source", () => {
    const root = tmpRoot();
    const path = writeRepoCandidateQueue(root, "github-repos", "2026-05-13T00:00:00.000Z", [repo("old", 10)]);

    writeRepoCandidateQueue(root, "github-repos", "2026-05-14T00:00:00.000Z", [repo("new", 20)]);

    const queue = repoCandidateQueueSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
    expect(queue.generated_at).toBe("2026-05-14T00:00:00.000Z");
    expect(queue.candidates.map((candidate) => candidate.id)).toEqual([
      "github__owner_new",
      "github__owner_old",
    ]);
  });
});
