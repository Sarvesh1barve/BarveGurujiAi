import { inspectFinishReason, mapGeminiError, retryBackoffMs } from "../src/ai/responseErrors";

describe("Gemini error mapping and backoff", () => {
  it("maps key, quota, model and temporary errors", () => {
    expect(mapGeminiError({ status: 401, message: "bad" }).code).toBe("invalid-key");
    expect(mapGeminiError({ status: 429, message: "quota" }).code).toBe("quota");
    expect(mapGeminiError({ status: 404, message: "model not found" }).code).toBe("model-unavailable");
    expect(mapGeminiError({ status: 503, message: "down" }).code).toBe("temporary");
  });
  it("uses capped exponential delays", () => { expect(retryBackoffMs(0, () => 0)).toBe(1_000); expect(retryBackoffMs(3, () => 0)).toBe(8_000); expect(retryBackoffMs(99, () => 0)).toBe(30_000); });
  it("rejects blocked and empty finishes", () => { expect(() => inspectFinishReason("SAFETY", undefined, false)).toThrow(/blocked/i); expect(() => inspectFinishReason("STOP", undefined, false)).toThrow(/without an answer/i); });
});
