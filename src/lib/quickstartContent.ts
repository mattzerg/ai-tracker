// Per-provider quickstart content. Keeps the [provider].astro page DRY.
// Snippets are intentionally minimal — just enough to hit the API and get a response.
// Each provider has the same shape; renderer is one file.

export interface Snippet {
  language: string;
  install?: string;
  code: string;
}

export interface ProviderQuickstart {
  slug: string;
  display_name: string;
  recommended_model_id: string;   // links to /models/<id>
  recommended_model_name: string;
  api_id: string;                  // the actual API id you pass
  alt_models: Array<{ id: string; name: string; note: string }>;
  what_its_for: string;             // 1-paragraph "when to pick this provider"
  auth_steps: string[];
  snippets: Snippet[];
  pricing_note: string;
  gotchas: Array<{ title: string; text: string }>;
  docs_url: string;
}

export const QUICKSTARTS: Record<string, ProviderQuickstart> = {
  anthropic: {
    slug: "anthropic",
    display_name: "Anthropic",
    recommended_model_id: "anthropic__claude-opus-4-7",
    recommended_model_name: "Claude Opus 4.7",
    api_id: "claude-opus-4-7",
    alt_models: [
      { id: "anthropic__claude-sonnet-4-6", name: "Claude Sonnet 4.6", note: "Lower cost, slightly weaker reasoning. Good default for high-volume work." },
      { id: "anthropic__claude-haiku-4-5", name: "Claude Haiku 4.5", note: "Cheapest tier. Good for classification + retrieval-augmented chat." },
    ],
    what_its_for: "Best-in-class for agentic coding loops and reasoning over long contexts. The 1M-context tier on Opus 4.7 collapses an entire class of context-windowing plumbing for production agent systems. Pick Anthropic when you need both depth and document-scale.",
    auth_steps: [
      "Create an API key at console.anthropic.com",
      "Set it as `ANTHROPIC_API_KEY` env var (or pass to the SDK explicitly)",
    ],
    snippets: [
      {
        language: "curl",
        code: `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Summarize the last week of AI model releases."}
    ]
  }'`,
      },
      {
        language: "python",
        install: "pip install anthropic",
        code: `from anthropic import Anthropic

client = Anthropic()
msg = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Summarize the last week of AI model releases."}],
)
print(msg.content[0].text)`,
      },
      {
        language: "node",
        install: "npm install @anthropic-ai/sdk",
        code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const msg = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Summarize the last week of AI model releases." }],
});
console.log(msg.content[0].type === "text" ? msg.content[0].text : "");`,
      },
    ],
    pricing_note: "Opus 4.7: $5/M input, $25/M output. Prompt caching cuts repeat-context cost ~90%; turn it on for any multi-turn agent loop.",
    gotchas: [
      { title: "max_tokens is required", text: "Unlike OpenAI's chat completions, Anthropic's `max_tokens` is required on every request. Set it to the response cap you want; the request fails otherwise." },
      { title: "Prompt caching is opt-in", text: "Without `cache_control` blocks on cacheable prefix segments, you're paying full input cost on every turn. Wire caching whenever the system prompt + tool definitions + long history are stable across calls." },
      { title: "Streaming tools work differently", text: "Tool use in streaming mode emits `content_block_delta` events; SDKs handle this but raw HTTP integrations often miss it." },
    ],
    docs_url: "https://docs.claude.com/en/docs/intro",
  },
  openai: {
    slug: "openai",
    display_name: "OpenAI",
    recommended_model_id: "openai__gpt-5.5-pro",
    recommended_model_name: "GPT-5.5 Pro",
    api_id: "gpt-5.5-pro",
    alt_models: [
      { id: "openai__gpt-5.5", name: "GPT-5.5", note: "Standard tier; same family, no the 'Pro' price premium." },
      { id: "openai__gpt-5.4-mini", name: "GPT-5.4 mini", note: "Cheap fast tier for retrieval + classification." },
      { id: "openai__gpt-5.4-nano", name: "GPT-5.4 nano", note: "Cheapest tier with 400K context. Best $/M long-context option in this lineup." },
    ],
    what_its_for: "Broadest tooling + ecosystem. If your stack expects the OpenAI chat-completions API shape (most third-party LLM tools do), this is the path of least resistance. Pick when you want the strongest function-calling defaults or the widest community of integrations.",
    auth_steps: [
      "Create an API key at platform.openai.com",
      "Set it as `OPENAI_API_KEY` env var",
    ],
    snippets: [
      {
        language: "curl",
        code: `curl https://api.openai.com/v1/responses \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.5-pro",
    "input": "Summarize the last week of AI model releases."
  }'`,
      },
      {
        language: "python",
        install: "pip install openai",
        code: `from openai import OpenAI

client = OpenAI()
res = client.responses.create(
    model="gpt-5.5-pro",
    input="Summarize the last week of AI model releases.",
)
print(res.output_text)`,
      },
      {
        language: "node",
        install: "npm install openai",
        code: `import OpenAI from "openai";

const client = new OpenAI();
const res = await client.responses.create({
  model: "gpt-5.5-pro",
  input: "Summarize the last week of AI model releases.",
});
console.log(res.output_text);`,
      },
    ],
    pricing_note: "GPT-5.5 Pro pricing varies; GPT-5.4 mini and nano are the cost-leader options. Long-context nano is the cheapest 400K-context tier in the catalog.",
    gotchas: [
      { title: "Two API surfaces", text: "OpenAI now has both `/chat/completions` (legacy, still works) and `/responses` (newer, agent-friendly). Pick `/responses` for new projects unless an existing tool expects chat-completions." },
      { title: "Reasoning models charge for thinking tokens", text: "If you're using a reasoning-enabled model variant, hidden reasoning tokens count toward output billing. Track them via the `reasoning_tokens` field in usage." },
      { title: "Rate-limit tiers", text: "New accounts start at low TPM/RPM. Hit production scale fast and you'll need to apply for tier bumps." },
    ],
    docs_url: "https://platform.openai.com/docs",
  },
  google: {
    slug: "google",
    display_name: "Google",
    recommended_model_id: "google__gemini-3.1-pro",
    recommended_model_name: "Gemini 3.1 Pro",
    api_id: "gemini-3.1-pro",
    alt_models: [
      { id: "google__gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", note: "Cheapest 1M-context model in this catalog. Use for high-volume RAG/summarization." },
      { id: "google__gemini-2.5-pro", name: "Gemini 2.5 Pro", note: "Prior-gen flagship. Still solid; cheaper than 3.1." },
      { id: "google__gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "Speed-tier alternative if Flash-Lite is too lean." },
    ],
    what_its_for: "Best long-context-per-dollar in the market and native multimodal that handles video, audio, and images first-class. Pick Google when you're processing big documents, doing video analysis, or need very cheap per-token rates at long context.",
    auth_steps: [
      "Create an API key at aistudio.google.com",
      "Set it as `GEMINI_API_KEY` env var",
    ],
    snippets: [
      {
        language: "curl",
        code: `curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro:generateContent?key=$GEMINI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{
      "parts": [{"text": "Summarize the last week of AI model releases."}]
    }]
  }'`,
      },
      {
        language: "python",
        install: "pip install google-genai",
        code: `from google import genai

client = genai.Client()
res = client.models.generate_content(
    model="gemini-3.1-pro",
    contents="Summarize the last week of AI model releases.",
)
print(res.text)`,
      },
      {
        language: "node",
        install: "npm install @google/genai",
        code: `import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({});
const res = await client.models.generateContent({
  model: "gemini-3.1-pro",
  contents: "Summarize the last week of AI model releases.",
});
console.log(res.text);`,
      },
    ],
    pricing_note: "Gemini 3.1 Flash-Lite is the cost leader in this catalog for 1M-context workloads. Pro tier costs more but handles complex reasoning + agentic loops better.",
    gotchas: [
      { title: "Two SDK lineages", text: "The newer `google-genai` SDK is the supported one; the older `google-generativeai` is deprecated. Check the import path — `from google import genai` (new) vs `import google.generativeai` (old)." },
      { title: "Safety filters can block surprising things", text: "Gemini's content filters are stricter than Anthropic/OpenAI defaults. Persona-driven content (roleplay, character voices) can trigger filters even when benign. Inspect `prompt_feedback` if responses are unexpectedly empty." },
      { title: "Region matters for rate limits", text: "Free-tier rate limits and feature availability vary by region. Same API key can behave differently from EU vs US." },
    ],
    docs_url: "https://ai.google.dev/gemini-api/docs",
  },
  mistral: {
    slug: "mistral",
    display_name: "Mistral",
    recommended_model_id: "mistral__mistral-large-2512",
    recommended_model_name: "Mistral Large 2512",
    api_id: "mistral-large-latest",
    alt_models: [
      { id: "mistral__mistral-medium-3.1", name: "Mistral Medium 3.1", note: "Mid-tier; balances cost and capability." },
      { id: "mistral__codestral-2508", name: "Codestral 2508", note: "Code-specialized model; competitive with general-purpose models on code tasks at lower cost." },
      { id: "mistral__devstral-2512", name: "Devstral 2512", note: "Agentic-coding specialized; good fit for autonomous code-edit loops." },
    ],
    what_its_for: "European-data-residency friendly; competitive on code tasks via Codestral/Devstral; strong multilingual. Pick when you need EU hosting, code-specialist models, or want a non-US alternative in a portfolio.",
    auth_steps: [
      "Create an API key at console.mistral.ai",
      "Set it as `MISTRAL_API_KEY` env var",
    ],
    snippets: [
      {
        language: "curl",
        code: `curl https://api.mistral.ai/v1/chat/completions \\
  -H "Authorization: Bearer $MISTRAL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "mistral-large-latest",
    "messages": [
      {"role": "user", "content": "Summarize the last week of AI model releases."}
    ]
  }'`,
      },
      {
        language: "python",
        install: "pip install mistralai",
        code: `from mistralai import Mistral

client = Mistral(api_key=__import__("os").environ["MISTRAL_API_KEY"])
res = client.chat.complete(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "Summarize the last week of AI model releases."}],
)
print(res.choices[0].message.content)`,
      },
      {
        language: "node",
        install: "npm install @mistralai/mistralai",
        code: `import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const res = await client.chat.complete({
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Summarize the last week of AI model releases." }],
});
console.log(res.choices[0].message.content);`,
      },
    ],
    pricing_note: "Mistral pricing sits between Anthropic and the Llama-via-Together tier. Codestral undercuts most code-specialized closed models.",
    gotchas: [
      { title: "Chat-completions shape (OpenAI-compatible)", text: "Mistral's chat API mirrors OpenAI's, so OpenAI-compatible tools mostly Just Work. The cost is missing the agent-specific affordances of Anthropic Messages API or OpenAI Responses." },
      { title: "Latest-tag drift", text: "`mistral-large-latest` rolls to the newest version automatically. For reproducibility, pin to a dated id (e.g., `mistral-large-2512`)." },
      { title: "Lower JSON-mode reliability", text: "JSON-mode + tool-use are present but historically less reliable than Anthropic/OpenAI. Validate outputs strictly." },
    ],
    docs_url: "https://docs.mistral.ai",
  },
  meta: {
    slug: "meta",
    display_name: "Meta (Llama models)",
    recommended_model_id: "meta__llama-4-maverick",
    recommended_model_name: "Llama 4 Maverick",
    api_id: "meta-llama/llama-4-maverick",
    alt_models: [
      { id: "meta__llama-4-scout", name: "Llama 4 Scout", note: "Smaller Llama 4 variant; cheaper, still 10M context." },
      { id: "meta__llama-3.3-70b-instruct", name: "Llama 3.3 70B", note: "Prior-gen 70B; well-supported across hosts; cheapest serious open-weight model." },
    ],
    what_its_for: "Open weights, runnable in your own infrastructure, no per-token API tax. Pick when you need full inference control (privacy, latency, custom fine-tuning), or when you want to avoid the closed-model lock-in.",
    auth_steps: [
      "Meta doesn't ship a first-party hosted API. Use one of: OpenRouter (router across providers), Together AI, Groq (fastest), Fireworks, or self-host via vLLM / Ollama.",
      "This guide uses OpenRouter (simplest cross-host adapter). Get a key at openrouter.ai.",
      "Set `OPENROUTER_API_KEY` env var.",
    ],
    snippets: [
      {
        language: "curl",
        code: `curl https://openrouter.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "meta-llama/llama-4-maverick",
    "messages": [
      {"role": "user", "content": "Summarize the last week of AI model releases."}
    ]
  }'`,
      },
      {
        language: "python",
        install: "pip install openai",
        code: `# Using OpenAI SDK pointed at OpenRouter (it's OpenAI-compatible).
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=__import__("os").environ["OPENROUTER_API_KEY"],
)
res = client.chat.completions.create(
    model="meta-llama/llama-4-maverick",
    messages=[{"role": "user", "content": "Summarize the last week of AI model releases."}],
)
print(res.choices[0].message.content)`,
      },
      {
        language: "node",
        install: "npm install openai",
        code: `// Using OpenAI SDK pointed at OpenRouter (it's OpenAI-compatible).
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
const res = await client.chat.completions.create({
  model: "meta-llama/llama-4-maverick",
  messages: [{ role: "user", content: "Summarize the last week of AI model releases." }],
});
console.log(res.choices[0].message.content);`,
      },
    ],
    pricing_note: "Hosted Llama via OpenRouter / Together / Groq is dramatically cheaper than closed-model APIs at comparable scale. Self-hosted is free per-token but you pay GPU-hours.",
    gotchas: [
      { title: "No first-party API", text: "Meta releases the weights, doesn't run the API. Quality of hosted endpoints varies by provider — Groq is fastest, Together is broadest, Fireworks balances. Pick deliberately." },
      { title: "Context-window throughput differs by host", text: "Llama 4's nominal 10M context is real, but many hosts cap their actual offering at 128K or 1M for throughput reasons. Check your provider's published limit." },
      { title: "Tool-use is less mature", text: "Llama models support tool-use but the calling conventions are less battle-tested than the closed-model equivalents. Validate strictly." },
    ],
    docs_url: "https://www.llama.com/docs/overview",
  },
};

export const QUICKSTART_SLUGS = Object.keys(QUICKSTARTS);
