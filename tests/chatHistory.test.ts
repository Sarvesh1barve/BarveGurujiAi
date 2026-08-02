import { buildAlternatingHistory } from "../src/ai/chatOrchestrator";
import type { ChatMessage } from "../src/types/storage";

const message = (id: string, role: ChatMessage["role"], content: string, status: ChatMessage["status"] = "complete"): ChatMessage => ({ id, sessionId: "s1", role, content, createdAt: `2026-01-01T00:00:0${id}.000Z`, updatedAt: "2026-01-01T00:00:00.000Z", status, attachmentIds: [] });

describe("Gemini history", () => {
  it("includes the latest user turn exactly once", () => {
    const contents = buildAlternatingHistory([message("1", "user", "first"), message("2", "assistant", "answer"), message("3", "user", "latest")], "3");
    const texts = contents.flatMap(({ parts }) => parts ?? []).map((part) => "text" in part ? part.text : "");
    expect(texts.filter((text) => text?.includes("latest"))).toHaveLength(1); expect(contents.map(({ role }) => role)).toEqual(["user", "model", "user"]);
  });

  it("excludes failed placeholders and local calculation cards", () => {
    const contents = buildAlternatingHistory([message("1", "user", "question"), message("2", "calculation", "facts"), message("3", "assistant", "failed", "failed"), message("4", "user", "again")], "4");
    expect(JSON.stringify(contents)).not.toContain("failed"); expect(JSON.stringify(contents)).not.toContain("facts");
  });
});
