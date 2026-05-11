import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

export interface QueueBranch {
  name: string;
  commitsAhead: number;
  lastCommit: string | null; // ISO date
  lastSubject: string | null;
}

export interface QueueStatus {
  available: boolean;
  branches: QueueBranch[];
  totalQueued: number;
}

const QUEUE_BRANCHES = ["submissions/queue", "ingest/queue"];

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function inspect(branch: string): QueueBranch | null {
  try {
    git(`rev-parse --verify ${branch}`);
  } catch {
    return null;
  }
  let commitsAhead = 0;
  try {
    commitsAhead = Number(git(`rev-list --count ${branch} ^main`)) || 0;
  } catch {
    return null;
  }
  let lastCommit: string | null = null;
  let lastSubject: string | null = null;
  if (commitsAhead > 0) {
    try {
      lastCommit = git(`log -1 --format=%cI ${branch}`);
      lastSubject = git(`log -1 --format=%s ${branch}`);
    } catch {
      // leave nulls
    }
  }
  return { name: branch, commitsAhead, lastCommit, lastSubject };
}

export function loadQueueStatus(): QueueStatus {
  try {
    git("rev-parse --git-dir");
  } catch {
    return { available: false, branches: [], totalQueued: 0 };
  }
  const branches = QUEUE_BRANCHES.map(inspect).filter((b): b is QueueBranch => b !== null);
  const totalQueued = branches.reduce((sum, b) => sum + b.commitsAhead, 0);
  return { available: true, branches, totalQueued };
}
