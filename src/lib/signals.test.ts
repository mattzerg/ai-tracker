import { describe, it, expect } from "vitest";
import { loadSignalsIndex } from "./data.ts";

// The signals index is optional (null when the local miner hasn't run), but
// when present it must satisfy the published contract /signals.json relies on.
describe("loadSignalsIndex", () => {
  it("returns null or a valid index with sane scores", () => {
    const index = loadSignalsIndex();
    if (index === null) return; // acceptable: miner hasn't produced data
    expect(index.schema_version).toBe(1);
    expect(typeof index.generated_at).toBe("string");
    for (const [id, sig] of Object.entries(index.entities)) {
      expect(id.length).toBeGreaterThan(0);
      expect(sig.signal_score).toBeGreaterThanOrEqual(0);
      expect(sig.signal_score).toBeLessThanOrEqual(100);
      for (const m of sig.mentions) {
        // Privacy contract: mention sources are public-safe channel slugs.
        expect(m.source.length).toBeGreaterThan(0);
      }
    }
  });
});
