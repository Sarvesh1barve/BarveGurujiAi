import type { ReferenceDocument, StoredAttachment, SupportedAttachmentMime } from "../types/storage";
import { createId } from "../utils/ids";
import { getDatabase } from "./database";

export const SUPPORTED_ATTACHMENT_MIMES: SupportedAttachmentMime[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function isSupportedAttachment(file: Pick<File, "type" | "size">): file is File & { type: SupportedAttachmentMime } {
  return file.size > 0 && SUPPORTED_ATTACHMENT_MIMES.includes(file.type as SupportedAttachmentMime);
}

export async function storeAttachment(file: File, sessionId: string, useMode: StoredAttachment["useMode"] = "message"): Promise<StoredAttachment> {
  if (!isSupportedAttachment(file)) throw new Error("Only non-empty JPEG, PNG, WebP and PDF files are supported.");
  const attachment: StoredAttachment = {
    id: createId("attachment"), sessionId, fileName: file.name.slice(0, 240), mimeType: file.type,
    size: file.size, createdAt: new Date().toISOString(), blob: file, useMode,
  };
  await (await getDatabase()).put("attachments", attachment);
  return attachment;
}

export async function saveAttachment(attachment: StoredAttachment): Promise<void> {
  await (await getDatabase()).put("attachments", attachment);
}

export async function getAttachment(id: string): Promise<StoredAttachment | undefined> {
  return (await getDatabase()).get("attachments", id);
}

export async function listSessionAttachments(sessionId: string): Promise<StoredAttachment[]> {
  return (await getDatabase()).getAllFromIndex("attachments", "by-session", sessionId);
}

export async function removeAttachment(id: string): Promise<void> {
  await (await getDatabase()).delete("attachments", id);
}

export async function clearAttachments(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["attachments", "references"], "readwrite");
  await tx.objectStore("attachments").clear();
  await tx.objectStore("references").clear();
  await tx.done;
}

export async function addReference(attachment: StoredAttachment, title: string, kind: ReferenceDocument["kind"]): Promise<ReferenceDocument> {
  const reference: ReferenceDocument = { id: createId("reference"), attachmentId: attachment.id, title: title.slice(0, 240), kind, createdAt: new Date().toISOString() };
  await (await getDatabase()).put("references", reference);
  await saveAttachment({ ...attachment, useMode: "library" });
  return reference;
}

export async function listReferences(): Promise<ReferenceDocument[]> {
  return (await getDatabase()).getAll("references");
}
