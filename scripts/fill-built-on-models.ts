// One-shot: hand-curated map of which tools are known to be built on which
// models. Conservative — only fills high-confidence wirings (vendor-owned +
// well-documented multi-model integrations). Pluggable OSS frameworks that
// support arbitrary models are deliberately left empty so the field means
// "actually uses this" rather than "could plug into this."
//
// Run: npm run tools:fill-built-on (or with --dry-run)

import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadTools } from "../src/lib/data.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TOOLS_DIR = join(ROOT, "data", "tools");
const dryRun = process.argv.includes("--dry-run");

// Map of tool.id → list of model.id refs. Order = "primary first".
const WIRING: Record<string, string[]> = {
  // Vendor-owned tools (only their own models).
  "chatgpt": [
    "openai__gpt-5.5",
    "openai__gpt-5.5-pro",
    "openai__gpt-5.4",
    "openai__gpt-5.4-mini",
  ],
  "claude-ai": [
    "anthropic__claude-opus-4-7",
    "anthropic__claude-sonnet-4-6",
    "anthropic__claude-haiku-4-5",
  ],
  "claude-code": [
    "anthropic__claude-opus-4-7",
    "anthropic__claude-sonnet-4-6",
    "anthropic__claude-haiku-4-5",
  ],
  "openai-codex": ["openai__gpt-5.3-codex"],
  "google-gemini-gemini-cli": [
    "google__gemini-3.1-pro",
    "google__gemini-2.5-pro",
    "google__gemini-2.5-flash",
    "google__gemini-3.1-flash-lite",
  ],
  "notebooklm": ["google__gemini-3.1-pro", "google__gemini-2.5-pro"],
  "google-adk-python": ["google__gemini-3.1-pro", "google__gemini-2.5-pro"],

  // Multi-vendor tools — list documented integrations, primary first.
  "cursor": [
    "anthropic__claude-sonnet-4-6",
    "anthropic__claude-opus-4-7",
    "openai__gpt-5.5",
    "openai__gpt-5.4",
    "google__gemini-3.1-pro",
  ],
  "v0": ["anthropic__claude-sonnet-4-6", "openai__gpt-5.5"],
  "devin": [
    "anthropic__claude-opus-4-7",
    "openai__gpt-5.5-pro",
    "openai__gpt-5.5",
  ],
  "replit-agent": ["anthropic__claude-sonnet-4-6", "openai__gpt-5.4"],
  "perplexity": [
    "anthropic__claude-sonnet-4-6",
    "openai__gpt-5.4",
    "google__gemini-2.5-pro",
  ],
  "cline": ["anthropic__claude-sonnet-4-6", "openai__gpt-5.4"],
  "lovable": ["anthropic__claude-sonnet-4-6", "openai__gpt-5.4"],
  "assafelovic-gpt-researcher": ["openai__gpt-5.4", "openai__gpt-5.4-mini"],
  "granola": ["anthropic__claude-sonnet-4-6", "openai__gpt-5.4"],
  "charmbracelet-crush": [
    "anthropic__claude-sonnet-4-6",
    "openai__gpt-5.4",
    "google__gemini-2.5-pro",
  ],
  "cherryhq-cherry-studio": [
    "anthropic__claude-sonnet-4-6",
    "openai__gpt-5.4",
    "google__gemini-2.5-pro",
  ],
};

function main() {
  const tools = loadTools();
  const byId = new Map(tools.map((t) => [t.id, t]));
  let written = 0;
  let unchanged = 0;
  let unknownToolIds: string[] = [];

  for (const [toolId, modelIds] of Object.entries(WIRING)) {
    const tool = byId.get(toolId);
    if (!tool) {
      unknownToolIds.push(toolId);
      continue;
    }
    const sameSet =
      tool.built_on_models.length === modelIds.length &&
      tool.built_on_models.every((m, i) => m === modelIds[i]);
    if (sameSet) {
      unchanged++;
      continue;
    }
    const path = join(TOOLS_DIR, `${toolId}.json`);
    const obj = JSON.parse(readFileSync(path, "utf8"));
    obj.built_on_models = modelIds;
    if (dryRun) {
      console.log(`  WOULD update ${toolId}: ${modelIds.length} models`);
    } else {
      writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
      console.log(`  ${toolId}: ${modelIds.length} models`);
    }
    written++;
  }

  console.log(`\nfill-built-on-models ${dryRun ? "(dry-run)" : ""}`);
  console.log(`  ${dryRun ? "would write" : "wrote"}: ${written}`);
  console.log(`  unchanged: ${unchanged}`);
  if (unknownToolIds.length) {
    console.log(`  unknown tool ids: ${unknownToolIds.join(", ")}`);
    process.exitCode = 1;
  }
}

main();
