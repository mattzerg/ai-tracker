import { describe, expect, it } from "vitest";
import { mergeModel } from "./merge.ts";
import type { Model } from "../../schemas/index.ts";

const base: Model = {
  kind: "model",
  id: "anthropic__x",
  name: "X",
  provider: "anthropic",
  released: "2026-01-01",
  context_window: 1000,
  output_window: null,
  modalities: ["text", "vision"],
  license: "proprietary",
  pricing: { input_per_mtok: 1, output_per_mtok: 2, as_of: "2026-05-09" },
  links: {},
  tags: ["frontier"],
  sources: ["https://anthropic.com/x"],
  status: "ga",
};

describe("mergeModel (supplementary)", () => {
  it("keeps existing curated name", () => {
    const proposed: Model = { ...base, name: "Anthropic: X (long form)" };
    const merged = mergeModel(base, proposed, { trust: "supplementary" });
    expect(merged.name).toBe("X");
  });

  it("unions modalities (existing rich, proposed bare)", () => {
    const proposed: Model = { ...base, modalities: ["text"] };
    const merged = mergeModel(base, proposed, { trust: "supplementary" });
    expect(merged.modalities).toEqual(expect.arrayContaining(["text", "vision"]));
    expect(merged.modalities).toHaveLength(2);
  });

  it("does not bump pricing.as_of when values match", () => {
    const proposed: Model = {
      ...base,
      pricing: { input_per_mtok: 1, output_per_mtok: 2, as_of: "2026-05-10" },
    };
    const merged = mergeModel(base, proposed, { trust: "supplementary" });
    expect(merged.pricing?.as_of).toBe("2026-05-09");
  });

  it("fills missing fields from proposed", () => {
    const blank: Model = { ...base, output_window: null, context_window: null };
    const proposed: Model = { ...base, output_window: 4096, context_window: 200_000 };
    const merged = mergeModel(blank, proposed, { trust: "supplementary" });
    expect(merged.output_window).toBe(4096);
    expect(merged.context_window).toBe(200_000);
  });

  it("unions sources", () => {
    const proposed: Model = { ...base, sources: ["https://openrouter.ai/api/v1/models"] };
    const merged = mergeModel(base, proposed, { trust: "supplementary" });
    expect(merged.sources).toEqual(expect.arrayContaining([
      "https://anthropic.com/x",
      "https://openrouter.ai/api/v1/models",
    ]));
  });
});

describe("mergeModel (authoritative)", () => {
  it("overwrites pricing on real change", () => {
    const proposed: Model = {
      ...base,
      pricing: { input_per_mtok: 0.5, output_per_mtok: 1.5, as_of: "2026-05-10" },
    };
    const merged = mergeModel(base, proposed, { trust: "authoritative" });
    expect(merged.pricing?.input_per_mtok).toBe(0.5);
    expect(merged.pricing?.as_of).toBe("2026-05-10");
  });
});
