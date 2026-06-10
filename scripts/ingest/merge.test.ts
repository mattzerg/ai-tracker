import { describe, expect, it } from "vitest";
import { mergeModel, mergeBenchmarks } from "./merge.ts";
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

describe("mergeBenchmarks", () => {
  it("returns undefined when neither side has benchmarks", () => {
    expect(mergeBenchmarks(undefined, undefined, false)).toBeUndefined();
  });

  it("supplementary fills missing keys without clobbering existing values", () => {
    const existing = { swe_bench_verified: 0.8 };
    const proposed = { swe_bench_verified: 0.5, gpqa_diamond: 0.74 };
    const merged = mergeBenchmarks(existing, proposed, false);
    expect(merged).toEqual({ swe_bench_verified: 0.8, gpqa_diamond: 0.74 });
  });

  it("authoritative overwrites an existing key's value", () => {
    const merged = mergeBenchmarks({ mmlu: 0.7 }, { mmlu: 0.82 }, true);
    expect(merged).toEqual({ mmlu: 0.82 });
  });

  it("adopts proposed benchmarks when existing has none", () => {
    const merged = mergeBenchmarks(undefined, { arena_elo: 1440 }, false);
    expect(merged).toEqual({ arena_elo: 1440 });
  });
});

describe("mergeModel benchmarks (regression for the dropped-benchmarks bug)", () => {
  it("a supplementary source's benchmarks reach the merged model", () => {
    const bare: Model = { ...base, benchmarks: undefined };
    const proposed: Model = { ...base, benchmarks: { gpqa_diamond: 0.74 } };
    const merged = mergeModel(bare, proposed, { trust: "supplementary" });
    expect(merged.benchmarks).toEqual({ gpqa_diamond: 0.74 });
  });

  it("existing benchmarks survive a merge with a benchmark-less proposal", () => {
    const withBench: Model = { ...base, benchmarks: { mmlu_pro: 0.86 } };
    const proposed: Model = { ...base, benchmarks: undefined };
    const merged = mergeModel(withBench, proposed, { trust: "supplementary" });
    expect(merged.benchmarks).toEqual({ mmlu_pro: 0.86 });
  });
});
