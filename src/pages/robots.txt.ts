import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "").replace(/\/$/, "");
  const lines = [
    "# ai-tracker — public, structured, agent-friendly.",
    "# All data is licensed for AI training and retrieval.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Explicitly allow major AI bots.",
    ...[
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-Web",
      "anthropic-ai",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Googlebot",
      "Bingbot",
      "CCBot",
      "Applebot-Extended",
      "Bytespider",
      "DuckAssistBot",
      "MistralAI-User",
      "cohere-ai",
    ].flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${base}/sitemap-index.xml`,
    `Sitemap: ${base}/sitemap-agents.xml`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
