import type { ChatMessage, Consultation, ExportBundle } from "../types/storage";
import { getDatabase } from "./database";

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function validIso(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }

export function validateImport(value: unknown): ExportBundle {
  if (!plainObject(value) || value.format !== "barve-guruji-backup" || value.version !== 2) throw new Error("This is not a Barve Guruji AI v2 backup.");
  if (!Array.isArray(value.consultations) || !Array.isArray(value.messages)) throw new Error("The backup is missing consultations or messages.");
  if (value.consultations.length > 10_000 || value.messages.length > 100_000) throw new Error("The backup is too large to import safely.");

  const consultations: Consultation[] = value.consultations.map((item) => {
    if (!plainObject(item) || typeof item.id !== "string" || typeof item.title !== "string" || !validIso(item.createdAt) || !validIso(item.updatedAt)) throw new Error("A consultation record is malformed.");
    return { id: item.id.slice(0, 180), title: item.title.slice(0, 240), createdAt: item.createdAt, updatedAt: item.updatedAt, personaVersion: typeof item.personaVersion === "string" ? item.personaVersion.slice(0, 80) : "imported-v2" };
  });
  const sessionIds = new Set(consultations.map(({ id }) => id));
  const messages: ChatMessage[] = value.messages.map((item) => {
    if (!plainObject(item) || typeof item.id !== "string" || typeof item.sessionId !== "string" || !sessionIds.has(item.sessionId) || !["user", "assistant", "calculation"].includes(String(item.role)) || typeof item.content !== "string" || !validIso(item.createdAt)) throw new Error("A message record is malformed.");
    return { id: item.id.slice(0, 180), sessionId: item.sessionId, role: item.role as ChatMessage["role"], content: item.content.slice(0, 200_000), createdAt: item.createdAt, updatedAt: validIso(item.updatedAt) ? item.updatedAt : item.createdAt, status: "complete", attachmentIds: [] };
  });
  return { format: "barve-guruji-backup", version: 2, exportedAt: validIso(value.exportedAt) ? value.exportedAt : new Date().toISOString(), consultations, messages };
}

export async function importBackup(bundle: ExportBundle): Promise<number> {
  const db = await getDatabase();
  const tx = db.transaction(["consultations", "messages"], "readwrite");
  const idMap = new Map<string, string>();
  for (const session of bundle.consultations) {
    const existing = await tx.objectStore("consultations").get(session.id);
    const id = existing ? `${session.id}_${crypto.randomUUID()}` : session.id;
    idMap.set(session.id, id);
    await tx.objectStore("consultations").put({ ...session, id, title: existing ? `${session.title} (imported)` : session.title });
  }
  for (const message of bundle.messages) {
    const sessionId = idMap.get(message.sessionId);
    if (!sessionId) continue;
    await tx.objectStore("messages").put({ ...message, id: `${message.id}_${crypto.randomUUID()}`, sessionId });
  }
  await tx.done;
  return bundle.consultations.length;
}
