import { getDatabase } from "../src/storage/database";
import { migrateLegacyStorage } from "../src/storage/migrations";

describe("legacy session migration", () => {
  it("copies legacy consultations and messages without deleting source data", async () => {
    const legacy = [{ id: "legacy-session", title: "Old consultation", createdAtISO: "2025-01-01T00:00:00.000Z", updatedAtISO: "2025-01-02T00:00:00.000Z", messages: [{ role: "user", content: "माझा प्रश्न", tsISO: "2025-01-01T00:00:00.000Z" }, { role: "assistant", content: "उत्तर", tsISO: "2025-01-01T00:00:01.000Z" }] }];
    localStorage.setItem("bg_sessions", JSON.stringify(legacy)); localStorage.setItem("bg_active_session_id", "legacy-session"); localStorage.setItem("bg_language", "mr");
    const result = await migrateLegacyStorage(); const db = await getDatabase();
    expect(result).toEqual({ migrated: 1, activeSessionId: "legacy-session" }); expect(await db.get("consultations", "legacy-session")).toMatchObject({ title: "Old consultation", personaVersion: "legacy-v1" }); expect(await db.getAllFromIndex("messages", "by-session", "legacy-session")).toHaveLength(2); expect(localStorage.getItem("bg_sessions")).toBe(JSON.stringify(legacy));
  });
});
