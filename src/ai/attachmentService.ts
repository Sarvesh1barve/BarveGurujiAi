import { GoogleGenAI, type Part } from "@google/genai";
import type { StoredAttachment } from "../types/storage";
import { saveAttachment } from "../storage/attachmentRepository";
import { mapGeminiError } from "./responseErrors";

// Current Gemini Files API documentation (checked 2026-08-02) specifies 50 MB for PDFs
// and 100 MB total request media. These checks are intentionally named and documented.
export const DOCUMENTED_PDF_LIMIT_BYTES = 50 * 1024 * 1024;
export const DOCUMENTED_REQUEST_MEDIA_LIMIT_BYTES = 100 * 1024 * 1024;
const INLINE_IMAGE_THRESHOLD = 4 * 1024 * 1024;

export function validateAttachmentSize(attachment: Pick<StoredAttachment, "mimeType" | "size">): void {
  if (attachment.size <= 0) throw new Error("The selected file is empty.");
  if (attachment.mimeType === "application/pdf" && attachment.size > DOCUMENTED_PDF_LIMIT_BYTES) throw new Error("This PDF exceeds Gemini's current documented 50 MB PDF limit.");
  if (attachment.size > DOCUMENTED_REQUEST_MEDIA_LIMIT_BYTES) throw new Error("This file exceeds Gemini's current documented request media limit.");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

async function waitUntilReady(ai: GoogleGenAI, name: string, signal: AbortSignal, onStatus: (status: string) => void) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (signal.aborted) throw new DOMException("Upload stopped", "AbortError");
    const file = await ai.files.get({ name, config: { abortSignal: signal } });
    const state = String(file.state ?? "ACTIVE").toUpperCase();
    if (state === "ACTIVE") return file;
    if (state === "FAILED") throw new Error("Gemini could not process this file.");
    onStatus("Gemini is processing the file");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Gemini file processing timed out.");
}

export async function attachmentsToParts(apiKey: string, attachments: StoredAttachment[], signal: AbortSignal, onStatus: (status: string) => void): Promise<Part[]> {
  const ai = new GoogleGenAI({ apiKey });
  const parts: Part[] = [];
  let total = 0;
  try {
    for (const attachment of attachments) {
      validateAttachmentSize(attachment);
      total += attachment.size;
      if (total > DOCUMENTED_REQUEST_MEDIA_LIMIT_BYTES) throw new Error("The selected files exceed Gemini's current documented total media limit.");
      if (attachment.mimeType.startsWith("image/") && attachment.size <= INLINE_IMAGE_THRESHOLD) {
        onStatus(`Reading ${attachment.fileName}`);
        parts.push({ inlineData: { data: await blobToBase64(attachment.blob), mimeType: attachment.mimeType } });
        continue;
      }

      onStatus(`Uploading ${attachment.fileName}`);
      let remote = attachment.remote;
      if (!remote) {
        const uploaded = await ai.files.upload({ file: attachment.blob, config: { displayName: attachment.fileName, mimeType: attachment.mimeType, abortSignal: signal } });
        if (!uploaded.name || !uploaded.uri) throw new Error("Gemini returned an incomplete file record.");
        const ready = await waitUntilReady(ai, uploaded.name, signal, onStatus);
        if (!ready.uri) throw new Error("Gemini file processing completed without a URI.");
        remote = { name: uploaded.name, uri: ready.uri, expiresAt: ready.expirationTime };
        await saveAttachment({ ...attachment, remote });
      }
      parts.push({ fileData: { fileUri: remote.uri, mimeType: attachment.mimeType } });
    }
    return parts;
  } catch (error) {
    throw mapGeminiError(error, "upload");
  }
}

export async function removeRemoteFile(apiKey: string, attachment: StoredAttachment): Promise<void> {
  if (!attachment.remote?.name) return;
  try { await new GoogleGenAI({ apiKey }).files.delete({ name: attachment.remote.name }); } catch { /* Remote expiry is also acceptable. */ }
}
