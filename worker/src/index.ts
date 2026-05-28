// ai-tracker Cloudflare Worker — Phase 4 mutating endpoints.
//
// Routes (mounted at api.<domain>):
//   POST /submit      → Turnstile + rate-limit + Haiku moderation → push
//                       commit to submissions/queue PR via GitHub API
//   POST /upvote      → KV-backed vote counter, 1 vote per (entity, ip-hash, 24h)
//   GET  /votes       → returns counts JSON (replaces /api/votes.json static stub)
//   OPTIONS *         → CORS preflight
//
// All endpoints CORS-open. Submit + upvote require Turnstile token in body.

interface Env {
  VOTES: KVNamespace;
  RATELIMIT: KVNamespace;
  GITHUB_REPO: string;
  QUEUE_BRANCH: string;
  ANTHROPIC_MODEL: string;
  MODERATION_MIN_CONFIDENCE: string;
  RATE_LIMIT_PER_DAY: string;
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET: string;
  ANTHROPIC_API_KEY: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const ENTITY_ID_RX = /^[a-z0-9][a-z0-9_-]*(?:__[a-z0-9][a-z0-9._-]*)?$/;
const REQUIRED_ENV_KEYS = [
  "GITHUB_REPO",
  "QUEUE_BRANCH",
  "GITHUB_TOKEN",
  "TURNSTILE_SECRET",
  "ANTHROPIC_API_KEY",
] as const;
const REQUIRED_KV_BINDINGS = ["VOTES", "RATELIMIT"] as const;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...headers },
  });
}

function validateEnv(env: Env): string | null {
  for (const key of REQUIRED_KV_BINDINGS) {
    if (!env[key]) return key;
  }
  for (const key of REQUIRED_ENV_KEYS) {
    if (!env[key]) return key;
  }
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  return (await sha256Hex(ip)).slice(0, 32);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

interface SubmitPayload {
  kind: "event" | "model" | "tool" | "repo";
  source: string;
  contact?: string;
  turnstile?: string;
  event?: { entity: string; type: string; date: string; summary: string; delta?: { field: string; from: unknown; to: unknown } };
  entity?: {
    kind: string;
    name?: string;
    provider?: string;
    released?: string | null;
    full_name?: string;
    category?: string;
    repo_url?: string;
    notes?: string;
  };
}

async function moderate(
  payload: SubmitPayload,
  env: Env,
): Promise<{ classification: "spam" | "duplicate" | "new-entity" | "new-event"; confidence: number; reason: string }> {
  const sys = "You moderate AI-tracker submissions. Classify as one of: spam, duplicate, new-entity, new-event. Reply ONLY JSON: {classification, confidence (0-1), reason}.";
  const user = JSON.stringify({ ...payload, turnstile: undefined });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 200,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    return { classification: "spam", confidence: 0, reason: `moderator error HTTP ${res.status}` };
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text ?? "{}";
  try {
    const parsed = JSON.parse(text.trim()) as { classification?: string; confidence?: number; reason?: string };
    return {
      classification: (parsed.classification as any) ?? "spam",
      confidence: parsed.confidence ?? 0,
      reason: parsed.reason ?? "",
    };
  } catch {
    return { classification: "spam", confidence: 0, reason: `parse failed: ${text.slice(0, 80)}` };
  }
}

async function pushToQueue(payload: SubmitPayload, classification: string, env: Env): Promise<{ commitUrl: string }> {
  // Append a JSON line to a submissions log file on the queue branch via the
  // GitHub Contents API. The actual schema-validated event/entity files are
  // produced from this log by a human reviewer (or a downstream Action).
  const filePath = `submissions/${new Date().toISOString().slice(0, 10)}.jsonl`;
  const line = JSON.stringify({ ...payload, _meta: { classification, ts: new Date().toISOString() } }) + "\n";

  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`;
  const branch = env.QUEUE_BRANCH;

  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "user-agent": "ai-tracker-worker/0.1",
  };

  // Read current file (if any) on the queue branch.
  async function readCurrent(): Promise<{ sha?: string; existing: string }> {
    const get = await fetch(`${apiBase}?ref=${branch}`, { headers });
    let sha: string | undefined;
    let existing = "";
    if (get.ok) {
      const data = (await get.json()) as { sha?: string; content?: string };
      sha = data.sha;
      if (data.content) existing = decodeBase64Utf8(data.content);
    }
    return { sha, existing };
  }

  async function putContent(sha: string | undefined, existing: string): Promise<Response> {
    const newContent = encodeBase64Utf8(existing + line);
    return fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: `submission(${classification}): ${payload.kind}`,
        content: newContent,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  // Retry once on GitHub Contents SHA races. This is enough for low-volume
  // public-beta submissions without moving queue writes to a Durable Object.
  let current = await readCurrent();
  let put = await putContent(current.sha, current.existing);
  if (put.status === 409 || put.status === 422) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    current = await readCurrent();
    put = await putContent(current.sha, current.existing);
  }
  if (!put.ok) {
    console.error("GitHub queue write failed", { status: put.status, body: await put.text() });
    throw new Error(`gh contents PUT failed: ${put.status}`);
  }
  const result = (await put.json()) as { commit?: { html_url?: string } };
  return { commitUrl: result.commit?.html_url ?? "" };
}

async function handleSubmit(req: Request, env: Env): Promise<Response> {
  let payload: SubmitPayload;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!payload.source) return json({ error: "source required" }, 400);
  if (!payload.turnstile) return json({ error: "turnstile token required" }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const ts = await verifyTurnstile(payload.turnstile, env.TURNSTILE_SECRET, ip);
  if (!ts) return json({ error: "turnstile failed" }, 403);

  // Rate limit: N submits per ip-hash per UTC day. KV is eventually
  // consistent, so this bounds normal abuse but is not a strict concurrency
  // primitive under simultaneous requests from the same IP hash.
  const day = new Date().toISOString().slice(0, 10);
  const hash = await ipHash(req);
  const rlKey = `rl:${day}:${hash}`;
  const cur = Number((await env.RATELIMIT.get(rlKey)) ?? "0");
  const cap = Number(env.RATE_LIMIT_PER_DAY ?? "5");
  if (cur >= cap) return json({ error: `rate-limited (${cap}/day)` }, 429);
  await env.RATELIMIT.put(rlKey, String(cur + 1), { expirationTtl: 86400 });

  const mod = await moderate(payload, env);
  if (mod.reason.startsWith("moderator error") || mod.reason.startsWith("parse failed")) {
    return json({ error: "moderation failed", reason: mod.reason }, 500);
  }
  const minConf = Number(env.MODERATION_MIN_CONFIDENCE ?? "0.4");
  if (mod.classification === "spam" || mod.confidence < minConf) {
    return json({ message: "rejected", reason: mod.reason, classification: mod.classification, confidence: mod.confidence }, 200);
  }

  try {
    const { commitUrl } = await pushToQueue({ ...payload, contact: undefined }, mod.classification, env);
    return json({ message: "queued for review", commit: commitUrl, classification: mod.classification, confidence: mod.confidence });
  } catch (err) {
    console.error("Queue push failed", err);
    return json({ error: "queue write failed; retry or contact maintainer" }, 500);
  }
}

async function handleUpvote(req: Request, env: Env): Promise<Response> {
  let body: { entity?: string; turnstile?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const entity = body.entity;
  if (!entity) return json({ error: "entity required" }, 400);
  if (!ENTITY_ID_RX.test(entity) || entity.length > 128) return json({ error: "invalid entity id" }, 400);
  if (!body.turnstile) return json({ error: "turnstile token required" }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, ip))) {
    return json({ error: "turnstile failed" }, 403);
  }

  // 1 vote per (entity, ip-hash, 24h).
  const hash = await ipHash(req);
  const guardKey = `voted:${entity}:${hash}`;
  if (await env.VOTES.get(guardKey)) return json({ message: "already voted today" }, 200);
  await env.VOTES.put(guardKey, "1", { expirationTtl: 86400 });

  const countKey = `count:${entity}`;
  const cur = Number((await env.VOTES.get(countKey)) ?? "0");
  const next = cur + 1;
  await env.VOTES.put(countKey, String(next));
  return json({ entity, count: next });
}

async function handleVotes(env: Env): Promise<Response> {
  const counts: Record<string, number> = {};
  let cursor: string | undefined;
  do {
    const list = await env.VOTES.list({ prefix: "count:", cursor });
    const values = await Promise.all(list.keys.map((k) => env.VOTES.get(k.name)));
    list.keys.forEach((k, i) => {
      const v = values[i];
      counts[k.name.slice("count:".length)] = Number(v ?? "0");
    });
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return json({ generated_at: new Date().toISOString(), schema_version: 1, counts }, 200, { "cache-control": "public, max-age=30" });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const missing = validateEnv(env);
    if (missing) return json({ error: `worker misconfigured: ${missing} not set` }, 500);
    if (req.method === "POST" && url.pathname === "/submit") return handleSubmit(req, env);
    if (req.method === "POST" && url.pathname === "/upvote") return handleUpvote(req, env);
    if (req.method === "GET" && url.pathname === "/votes") return handleVotes(env);
    return json({ error: "not found", routes: ["POST /submit", "POST /upvote", "GET /votes"] }, 404);
  },
};
