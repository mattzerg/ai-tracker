import { describe, expect, it } from "vitest";
import { canonicalizeId } from "./canonicalize.ts";

describe("canonicalizeId", () => {
  it("rewrites Anthropic dot-versions to dash-versions", () => {
    expect(canonicalizeId("anthropic", "claude-opus-4.7")).toBe("claude-opus-4-7");
    expect(canonicalizeId("anthropic", "claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
    expect(canonicalizeId("anthropic", "claude-3.7-sonnet")).toBe("claude-3-7-sonnet");
    expect(canonicalizeId("anthropic", "claude-3.5-sonnet")).toBe("claude-3-5-sonnet");
  });

  it("leaves Anthropic dash-versions untouched", () => {
    expect(canonicalizeId("anthropic", "claude-opus-4-7")).toBe("claude-opus-4-7");
    expect(canonicalizeId("anthropic", "claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
  });

  it("does NOT rewrite dots for other providers", () => {
    expect(canonicalizeId("google", "gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(canonicalizeId("openai", "gpt-5.4")).toBe("gpt-5.4");
    expect(canonicalizeId("xai", "grok-4.3")).toBe("grok-4.3");
    expect(canonicalizeId("alibaba", "qwen3.5-max")).toBe("qwen3.5-max");
  });

  it("preserves trailing date suffixes", () => {
    expect(canonicalizeId("anthropic", "claude-opus-4.6-20251104")).toBe("claude-opus-4-6-20251104");
  });
});
