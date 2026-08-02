import { validateImport } from "../src/storage/importValidation";

describe("backup import validation", () => {
  const valid = { format: "barve-guruji-backup", version: 2, exportedAt: "2026-01-01T00:00:00.000Z", consultations: [{ id: "s", title: "Test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", personaVersion: "v" }], messages: [{ id: "m", sessionId: "s", role: "user", content: "<script>x</script>", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] };
  it("accepts known records while normalising executable status fields", () => { const result = validateImport(valid); expect(result.messages[0]?.status).toBe("complete"); expect(result.messages[0]?.attachmentIds).toEqual([]); });
  it("rejects malformed and cross-session records", () => { expect(() => validateImport({ ...valid, version: 9 })).toThrow(); expect(() => validateImport({ ...valid, messages: [{ ...valid.messages[0], sessionId: "missing" }] })).toThrow(/malformed/); });
});
