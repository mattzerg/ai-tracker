import { describe, expect, it } from "vitest";
import { analyticsEnabled, buildEvent, isKnownEvent, EVENTS } from "./analytics.ts";

describe("analyticsEnabled", () => {
  it("off when no endpoint configured", () => {
    expect(analyticsEnabled({ endpoint: null })).toBe(false);
    expect(analyticsEnabled({ endpoint: "" })).toBe(false);
  });

  it("on when endpoint set and no DNT / opt-out", () => {
    expect(analyticsEnabled({ endpoint: "https://x/collect", doNotTrack: "0" })).toBe(true);
    expect(analyticsEnabled({ endpoint: "https://x/collect", doNotTrack: null })).toBe(true);
  });

  it("respects Do-Not-Track in all its spellings", () => {
    for (const dnt of ["1", "yes", "true", "YES"]) {
      expect(analyticsEnabled({ endpoint: "https://x", doNotTrack: dnt })).toBe(false);
    }
  });

  it("respects explicit opt-out", () => {
    expect(analyticsEnabled({ endpoint: "https://x", optedOut: true })).toBe(false);
  });
});

describe("buildEvent", () => {
  it("produces a clean payload with event/ts/path/props", () => {
    const e = buildEvent("search_query", "/search", { len: 5, zero: false }, "2026-06-04T00:00:00Z");
    expect(e).toEqual({
      event: "search_query",
      ts: "2026-06-04T00:00:00Z",
      path: "/search",
      props: { len: 5, zero: false },
    });
  });

  it("drops non-scalar props (no objects, arrays, functions, PII blobs)", () => {
    const e = buildEvent("page_view", "/", { ok: "yes", obj: { a: 1 }, arr: [1, 2], fn: () => 0 } as any);
    expect(e.props).toEqual({ ok: "yes" });
  });

  it("caps free-text strings to avoid leaking long payloads", () => {
    const long = "x".repeat(500);
    const e = buildEvent("search_query", "/search", { q: long });
    expect((e.props.q as string).length).toBe(120);
  });
});

describe("isKnownEvent", () => {
  it("accepts the taxonomy and rejects unknowns", () => {
    for (const name of EVENTS) expect(isKnownEvent(name)).toBe(true);
    expect(isKnownEvent("evil_event")).toBe(false);
    expect(isKnownEvent("")).toBe(false);
  });
});
