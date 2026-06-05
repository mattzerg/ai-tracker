import { describe, expect, it } from "vitest";
import { isJunkRepo } from "./sources/github-repos.ts";

describe("isJunkRepo", () => {
  describe("rejects educational / list-style repos", () => {
    // Real junk currently or formerly in the candidate queue (docs/follow-ups.md)
    const junk: Array<[string, string | null]> = [
      ["awesome-llm-apps", "Collection of awesome LLM apps with AI Agents and RAG"],
      ["Prompt-Engineering-Guide", "Guides, papers, lecture, notebooks and resources for prompt engineering"],
      ["Front-End-Checklist", "The perfect Front-End Checklist for modern websites"],
      ["ai-agents-for-beginners", "11 Lessons to Get Started Building AI Agents"],
      ["learn-claude-code", "Learn Claude Code in 30 days"],
      ["awesome-mcp-servers", "A curated list of MCP servers"],
      ["llm-course", "Course to get into Large Language Models"],
      ["machine-learning-roadmap", "A roadmap connecting many of the most important concepts in ML"],
      ["tech-interview-handbook", "Curated coding interview preparation materials"],
      ["python-cheatsheet", "Comprehensive Python cheatsheet"],
      ["rag-tutorial", "Build a RAG system step by step"],
      ["openai-cookbook-examples", "Collection of examples for the OpenAI API"],
    ];

    for (const [name, description] of junk) {
      it(`rejects ${name}`, () => {
        expect(isJunkRepo(name, description)).toBe(true);
      });
    }
  });

  describe("keeps real AI infrastructure repos", () => {
    // Existing first-class repos + strong promotion candidates — none may false-match
    const real: Array<[string, string | null]> = [
      ["langchain", "Build context-aware reasoning applications"],
      ["langgraph", "Build resilient language agents as graphs"],
      ["n8n", "Fair-code workflow automation platform with native AI capabilities"],
      ["dify", "Production-ready platform for agentic workflow development"],
      ["browser-use", "Browser automation primitives for AI agents"],
      ["qdrant", "High-performance, massive-scale Vector Database"],
      ["autogen", "A programming framework for agentic AI"],
      ["graphrag", "A modular graph-based Retrieval-Augmented Generation (RAG) system"],
      ["ragflow", "Open-source RAG engine based on deep document understanding"],
      ["gemini-cli", "An open-source AI agent that brings the power of Gemini into your terminal"],
      ["claude-mem", "Persistent memory compression system for Claude Code"],
      ["mem0", "Universal memory layer for AI Agents"],
      ["milvus", "Vector database built for scalable similarity search"],
      ["servers", "Model Context Protocol Servers"],
      // Tricky names that contain filter-adjacent substrings but are real infra:
      ["guidance", "A guidance language for controlling large language models"],
      ["llama_index", "The leading framework for building LLM-powered agents over your data"],
      ["PaddleOCR", "Multilingual OCR toolkits based on PaddlePaddle"],
    ];

    for (const [name, description] of real) {
      it(`keeps ${name}`, () => {
        expect(isJunkRepo(name, description)).toBe(false);
      });
    }
  });

  it("handles null descriptions", () => {
    expect(isJunkRepo("real-infra-repo", null)).toBe(false);
    expect(isJunkRepo("awesome-stuff", null)).toBe(true);
  });
});
