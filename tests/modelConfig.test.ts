import { isSafeModelName } from "../src/ai/modelConfig";

describe("fixed Gemini model configuration", () => { it("allows pinned IDs and rejects latest aliases", () => { expect(isSafeModelName("gemini-2.5-flash")).toBe(true); expect(isSafeModelName("gemini-flash-latest")).toBe(false); expect(isSafeModelName("../../secret")).toBe(false); }); });
