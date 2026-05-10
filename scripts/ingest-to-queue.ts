// Run ingest --apply on a long-lived submissions/queue branch, never main.
// Used by the cron path. Returns to main even on failure. Refuses to run
// when the working tree is dirty.
//
// Usage:
//   pnpm tsx scripts/ingest-to-queue.ts          # commit-or-noop on the queue
//   pnpm tsx scripts/ingest-to-queue.ts --status # report queue state, no writes

import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const QUEUE_BRANCH = "submissions/queue";
const BASE_BRANCH = "main";

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
}

function gitOk(cmd: string): boolean {
  try {
    execSync(`git ${cmd}`, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensureQueueBranch(): { existed: boolean } {
  const exists = gitOk(`show-ref --verify --quiet refs/heads/${QUEUE_BRANCH}`);
  if (!exists) {
    git(`branch ${QUEUE_BRANCH} ${BASE_BRANCH}`);
    return { existed: false };
  }
  return { existed: true };
}

function status(): { aheadOfMain: number; oldestCommitISO: string | null; topCommit: string | null } {
  if (!gitOk(`show-ref --verify --quiet refs/heads/${QUEUE_BRANCH}`)) {
    return { aheadOfMain: 0, oldestCommitISO: null, topCommit: null };
  }
  const ahead = Number(git(`rev-list --count ${BASE_BRANCH}..${QUEUE_BRANCH}`));
  if (ahead === 0) return { aheadOfMain: 0, oldestCommitISO: null, topCommit: null };
  const oldest = git(`log -1 --format=%cI ${BASE_BRANCH}..${QUEUE_BRANCH} --reverse`);
  const top = git(`log -1 --format='%h %s' ${QUEUE_BRANCH}`);
  return { aheadOfMain: ahead, oldestCommitISO: oldest, topCommit: top };
}

function statusReport(): void {
  const s = status();
  console.log(`queue branch: ${QUEUE_BRANCH}`);
  console.log(`ahead of ${BASE_BRANCH}: ${s.aheadOfMain} commit(s)`);
  if (s.aheadOfMain > 0) {
    console.log(`oldest in queue: ${s.oldestCommitISO}`);
    console.log(`top of queue:    ${s.topCommit}`);
  }
}

function ingestToQueue(): void {
  const branch = git("rev-parse --abbrev-ref HEAD");
  if (branch !== BASE_BRANCH) {
    console.error(`refusing: must be on ${BASE_BRANCH}, currently on ${branch}`);
    process.exit(1);
  }
  if (git("status --porcelain")) {
    console.error("refusing: working tree dirty");
    process.exit(1);
  }

  const e = ensureQueueBranch();
  console.log(`${e.existed ? "using existing" : "created"} ${QUEUE_BRANCH}`);

  git(`checkout -q ${QUEUE_BRANCH}`);
  console.log(`on ${QUEUE_BRANCH}`);

  let committed = false;
  try {
    execSync(`pnpm tsx scripts/ingest.ts --apply`, { cwd: ROOT, stdio: "inherit" });
    const post = git("status --porcelain");
    if (!post) {
      console.log("\nno changes — queue is up to date");
    } else {
      git("add data/");
      const date = new Date().toISOString().slice(0, 10);
      const fileCount = post.split("\n").length;
      const msg = `ingest(${date}): ${fileCount} file change(s)`;
      git(`commit -q -m "${msg}"`);
      committed = true;
      console.log(`\ncommitted: ${msg}`);
    }
  } finally {
    git(`checkout -q ${BASE_BRANCH}`);
    console.log(`returned to ${BASE_BRANCH}`);
  }

  console.log();
  statusReport();
  if (!committed) process.exit(0);
}

const arg = process.argv[2];
if (arg === "--status") {
  statusReport();
} else {
  ingestToQueue();
}
