import type { ChatMessage, Consultation } from "../types/storage";
import { getDatabase } from "./database";

interface LegacyMessage { role?: unknown; content?: unknown; tsISO?: unknown }
interface LegacySession { id?: unknown; title?: unknown; createdAtISO?: unknown; updatedAtISO?: unknown; messages?: unknown }

const LEGACY_KEYS = { sessions: "bg_sessions", active: "bg_active_session_id", language: "bg_language" } as const;

function iso(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

export async function migrateLegacyStorage(): Promise<{ migrated: number; activeSessionId?: string }> {
  const db = await getDatabase();
  if (await db.get("meta", "legacyMigrationV2")) {
    const active = localStorage.getItem(LEGACY_KEYS.active) || undefined;
    return { migrated: 0, activeSessionId: active };
  }

  let parsed: unknown = [];
  try { parsed = JSON.parse(localStorage.getItem(LEGACY_KEYS.sessions) ?? "[]"); } catch { parsed = []; }
  const legacySessions = Array.isArray(parsed) ? parsed as LegacySession[] : [];
  const transaction = db.transaction(["consultations", "messages", "meta"], "readwrite");
  let migrated = 0;

  for (const legacy of legacySessions) {
    if (typeof legacy.id !== "string" || !Array.isArray(legacy.messages)) continue;
    const now = new Date().toISOString();
    const consultation: Consultation = {
      id: legacy.id,
      title: typeof legacy.title === "string" ? legacy.title.slice(0, 160) : "Imported consultation",
      createdAt: iso(legacy.createdAtISO, now),
      updatedAt: iso(legacy.updatedAtISO, now),
      personaVersion: "legacy-v1",
    };
    await transaction.objectStore("consultations").put(consultation);

    for (const [index, raw] of (legacy.messages as LegacyMessage[]).entries()) {
      if ((raw.role !== "user" && raw.role !== "assistant") || typeof raw.content !== "string") continue;
      const createdAt = iso(raw.tsISO, consultation.createdAt);
      const message: ChatMessage = {
        id: `legacy_${legacy.id}_${index}`,
        sessionId: legacy.id,
        role: raw.role,
        content: raw.content,
        createdAt,
        updatedAt: createdAt,
        status: "complete",
        attachmentIds: [],
      };
      await transaction.objectStore("messages").put(message);
    }
    migrated += 1;
  }

  await transaction.objectStore("meta").put({ completedAt: new Date().toISOString(), count: migrated }, "legacyMigrationV2");
  await transaction.done;

  const legacyLanguage = localStorage.getItem(LEGACY_KEYS.language);
  if (legacyLanguage && !localStorage.getItem("bg_settings_v2")) {
    localStorage.setItem("bg_migrated_language", legacyLanguage);
  }
  return { migrated, activeSessionId: localStorage.getItem(LEGACY_KEYS.active) || undefined };
}
