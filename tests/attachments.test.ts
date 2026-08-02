import { DOCUMENTED_PDF_LIMIT_BYTES, validateAttachmentSize } from "../src/ai/attachmentService";
import { isSupportedAttachment } from "../src/storage/attachmentRepository";

describe("attachment validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "application/pdf"])("accepts %s", (type) => expect(isSupportedAttachment(new File(["x"], "file", { type }))).toBe(true));
  it("rejects unsupported or empty files", () => { expect(isSupportedAttachment(new File(["x"], "x.svg", { type: "image/svg+xml" }))).toBe(false); expect(isSupportedAttachment(new File([], "x.pdf", { type: "application/pdf" }))).toBe(false); });
  it("reports the current documented PDF size limit", () => { expect(() => validateAttachmentSize({ mimeType: "application/pdf", size: DOCUMENTED_PDF_LIMIT_BYTES + 1 })).toThrow(/50 MB/); });
});
