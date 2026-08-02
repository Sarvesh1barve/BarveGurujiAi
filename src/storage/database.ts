import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CalculationCacheEntry, ChatMessage, Consultation, ReferenceDocument, StoredAttachment } from "../types/storage";

interface BarveGurujiSchema extends DBSchema {
  consultations: {
    key: string;
    value: Consultation;
    indexes: { "by-updated": string };
  };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { "by-session": string; "by-created": string };
  };
  attachments: {
    key: string;
    value: StoredAttachment;
    indexes: { "by-session": string; "by-message": string; "by-mode": string };
  };
  references: {
    key: string;
    value: ReferenceDocument;
    indexes: { "by-kind": string };
  };
  calculationCache: { key: string; value: CalculationCacheEntry };
  meta: { key: string; value: unknown };
}

let databasePromise: Promise<IDBPDatabase<BarveGurujiSchema>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<BarveGurujiSchema>> {
  databasePromise ??= openDB<BarveGurujiSchema>("barve-guruji-ai", 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("consultations")) {
        const store = db.createObjectStore("consultations", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
      }
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("by-session", "sessionId");
        store.createIndex("by-created", "createdAt");
      }
      if (!db.objectStoreNames.contains("attachments")) {
        const store = db.createObjectStore("attachments", { keyPath: "id" });
        store.createIndex("by-session", "sessionId");
        store.createIndex("by-message", "messageId");
        store.createIndex("by-mode", "useMode");
      }
      if (!db.objectStoreNames.contains("references")) {
        const store = db.createObjectStore("references", { keyPath: "id" });
        store.createIndex("by-kind", "kind");
      }
      if (!db.objectStoreNames.contains("calculationCache")) db.createObjectStore("calculationCache", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    },
    blocked() {
      window.dispatchEvent(new CustomEvent("bg:database-blocked"));
    },
  });
  return databasePromise;
}

export async function estimateStorage(): Promise<{ used: number; quota: number }> {
  const estimate = await navigator.storage?.estimate?.();
  return { used: estimate?.usage ?? 0, quota: estimate?.quota ?? 0 };
}
