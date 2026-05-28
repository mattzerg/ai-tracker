#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const wrangler = readFileSync(join(here, "..", "wrangler.toml"), "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

const missing = [];
for (const block of wrangler.split("[[kv_namespaces]]").slice(1)) {
  const binding = block.match(/binding\s*=\s*"([^"]+)"/)?.[1] ?? "unknown";
  const id = block.match(/id\s*=\s*"([^"]*)"/)?.[1] ?? "";
  if (!id.trim()) missing.push(binding);
}

if (missing.length) {
  console.error(`Missing Cloudflare KV namespace id(s): ${missing.join(", ")}`);
  console.error('Create them with `wrangler kv:namespace create "<BINDING>"`, paste the ids into worker/wrangler.toml, then rerun deploy.');
  process.exit(1);
}
