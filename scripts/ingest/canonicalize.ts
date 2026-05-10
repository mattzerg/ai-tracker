// Provider-specific ID canonicalization.
//
// Different sources use different version conventions for the same model.
// OpenRouter's `anthropic/claude-opus-4.7` and Anthropic's API id `claude-opus-4-7`
// must reconcile to a single internal id. We pick the provider's authoritative
// API id format as canonical and rewrite supplementary-source ids to match.
//
// Per provider:
// - anthropic: Anthropic's API uses dashes between digits (`claude-opus-4-7`).
//   Aggregator dot-versions (`claude-opus-4.7`) get rewritten.
// - google:    Google uses dots (`gemini-2.5-pro`). No change.
// - openai:    OpenAI uses dots (`gpt-5.4`). No change.
// - xai:       xAI uses dots (`grok-4.3`). No change.
// - meta:      Hyphens (`llama-4-maverick`). No change.
// - mistral, alibaba, deepseek, cohere: source-native, no change.

export function canonicalizeId(provider: string, idTail: string): string {
  switch (provider) {
    case "anthropic":
      // Replace dots between digits with dashes: "claude-opus-4.7" → "claude-opus-4-7".
      // Also "claude-3.5-sonnet" → "claude-3-5-sonnet" (matches Anthropic's old-style ids).
      return idTail.replace(/(\d)\.(\d)/g, "$1-$2");
    default:
      return idTail;
  }
}
