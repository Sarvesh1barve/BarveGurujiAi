import type { ChatMessage, Consultation, ExportBundle } from "../types/storage";
import { createId } from "../utils/ids";
import { getDatabase } from "./database";

export async function createConsultation(title = "New Consultation"): Promise<Consultation> {
  const now = new Date().toISOString();
  const consultation: Consultation = { id: createId("session"), title, createdAt: now, updatedAt: now, personaVersion: "pandit-anant-v2" };
  const db = await getDatabase();
  await db.put("consultations", consultation);
  return consultation;
}

export async function listConsultations(query = ""): Promise<Consultation[]> {
  const db = await getDatabase();
  const all = await db.getAllFromIndex("consultations", "by-updated");
  const needle = query.trim().toLocaleLowerCase();
  return all.filter((item) => !needle || item.title.toLocaleLowerCase().includes(needle)).reverse();
}

export async function getConsultation(id: string): Promise<Consultation | undefined> {
  return (await getDatabase()).get("consultations", id);
}

export async function saveConsultation(consultation: Consultation): Promise<void> {
  await (await getDatabase()).put("consultations", { ...consultation, updatedAt: new Date().toISOString() });
}

export async function deleteConsultation(id: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["consultations", "messages", "attachments"], "readwrite");
  await tx.objectStore("consultations").delete(id);
  for (const message of await tx.objectStore("messages").index("by-session").getAll(id)) await tx.objectStore("messages").delete(message.id);
  for (const attachment of await tx.objectStore("attachments").index("by-session").getAll(id)) await tx.objectStore("attachments").delete(attachment.id);
  await tx.done;
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const messages = await (await getDatabase()).getAllFromIndex("messages", "by-session", sessionId);
  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  await (await getDatabase()).put("messages", message);
}

export async function deleteMessage(id: string): Promise<void> {
  await (await getDatabase()).delete("messages", id);
}

export async function clearMessages(sessionId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction("messages", "readwrite");
  const index = tx.store.index("by-session");
  for (const key of await index.getAllKeys(sessionId)) await tx.store.delete(key);
  await tx.done;
}

export async function exportConsultations(sessionId?: string): Promise<ExportBundle> {
  const db = await getDatabase();
  const consultations = sessionId ? (await db.get("consultations", sessionId) ? [await db.get("consultations", sessionId) as Consultation] : []) : await db.getAll("consultations");
  const messages = sessionId ? await listMessages(sessionId) : await db.getAll("messages");
  return { format: "barve-guruji-backup", version: 2, exportedAt: new Date().toISOString(), consultations, messages };
}

export async function clearAllChats(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(["consultations", "messages"], "readwrite");
  await tx.objectStore("consultations").clear();
  await tx.objectStore("messages").clear();
  await tx.done;
}
