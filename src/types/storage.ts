import type { EvidenceLevel, VerifiedChart, VerifiedContext } from "./domain";

export type MessageRole = "user" | "assistant" | "calculation";
export type MessageStatus = "complete" | "streaming" | "failed" | "stopped" | "pending-confirmation";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  updatedAt: string;
  status: MessageStatus;
  attachmentIds: string[];
  verifiedContext?: VerifiedContext;
  evidenceLevel?: EvidenceLevel;
  errorCode?: string;
}

export interface Consultation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  personaVersion: string;
  verifiedChart?: VerifiedChart;
}

export interface StoredAttachment {
  id: string;
  sessionId: string;
  messageId?: string;
  fileName: string;
  mimeType: SupportedAttachmentMime;
  size: number;
  createdAt: string;
  blob: Blob;
  useMode: "message" | "pinned" | "library";
  remote?: { name: string; uri: string; expiresAt?: string };
}

export type SupportedAttachmentMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface ReferenceDocument {
  id: string;
  attachmentId: string;
  title: string;
  kind: "panchang" | "ritual-notes" | "shastra" | "kundali-report" | "other";
  createdAt: string;
}

export interface CalculationCacheEntry {
  key: string;
  value: VerifiedContext;
  createdAt: string;
  engineVersion: string;
}

export interface ExportBundle {
  format: "barve-guruji-backup";
  version: 2;
  exportedAt: string;
  consultations: Consultation[];
  messages: ChatMessage[];
}
