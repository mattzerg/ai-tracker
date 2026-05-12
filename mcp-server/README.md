# ai-tracker-mcp

MCP server for [ai-tracker](https://ai-tracker-dxu.pages.dev) — query the canonical AI models & tools timeline directly from Claude Desktop, Claude Code, or any MCP-compatible client.

## What you get

Five tools, all read-only against the public ai-tracker site (no API key needed):

| Tool | Returns |
|---|---|
| `search_models` | Filter the model catalog by query, provider, min context, max input/output price |
| `search_tools` | Filter the tool catalog by query, category, OSS-only, free-tier-only |
| `get_entity` | Full record for one model or tool, including pricing, modalities, sources, links, events |
| `get_timeline` | Chronological event list for one entity |
| `recent_events` | Cross-entity feed of releases, price changes, deprecations, etc. — newest first |

Search uses the lean `/api/search.json` index (~25 KB); detail tools fetch the per-entity JSON twin only when needed. Both layers cache for 5 minutes.

## Install

```bash
npm install -g ai-tracker-mcp
```

## Configure (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ai-tracker": {
      "command": "ai-tracker-mcp"
    }
  }
}
```

Restart Claude Desktop. The five tools appear under the 🔧 menu.

## Configure (Claude Code)

```bash
claude mcp add ai-tracker -- ai-tracker-mcp
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `AI_TRACKER_BASE` | `https://ai-tracker-dxu.pages.dev` | Override the site base URL (e.g. point at a staging deploy) |

## Examples

**"Cheapest frontier model under $5/M input"**

```json
{
  "tool": "search_models",
  "arguments": { "max_input_price": 5, "limit": 10 }
}
```

**"All Anthropic models with 1M+ context"**

```json
{
  "tool": "search_models",
  "arguments": { "provider": "anthropic", "min_context": 1000000 }
}
```

**"OSS agent frameworks"**

```json
{
  "tool": "search_tools",
  "arguments": { "category": "agent-framework", "oss_only": true }
}
```

**"What changed for Claude Opus 4.7"**

```json
{
  "tool": "get_timeline",
  "arguments": { "id": "anthropic__claude-opus-4-7" }
}
```

**"Anything shipped in the last week?"**

```json
{
  "tool": "recent_events",
  "arguments": { "since": "2026-05-04", "limit": 25 }
}
```

## Data sources

ai-tracker pulls from authoritative provider docs (Anthropic, Google, xAI, Mistral, OpenAI, DeepSeek, Meta, Alibaba, Cohere) plus supplementary aggregators (OpenRouter, GitHub topic search). Sources are tagged trust-level so authoritative entries can correct stale supplementary values, but supplementary sources never overwrite curated data. See [the about page](https://ai-tracker-dxu.pages.dev/about) for details.

## License

Public-domain data. Tool source MIT.
