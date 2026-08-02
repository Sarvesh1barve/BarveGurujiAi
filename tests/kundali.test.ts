import { validateKundaliExtraction } from "../src/ai/kundaliExtraction";

describe("Kundali extraction schema", () => {
  it("accepts a bounded extraction and rejects invented confidence", () => {
    const base = { chartStyle: "unknown", orientation: null, houses: [], placements: [{ planet: "Moon", confidence: .4 }], annotations: [], ambiguities: [{ field: "lagna", reason: "blurred" }], overallConfidence: .4 };
    expect(validateKundaliExtraction(base)).toBe(true); expect(validateKundaliExtraction({ ...base, overallConfidence: 2 })).toBe(false); expect(validateKundaliExtraction({ ...base, placements: [{ planet: "Moon", confidence: -1 }] })).toBe(false);
  });
});
