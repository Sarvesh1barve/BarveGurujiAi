import { safeErrorDetail } from "../utils/security";

export type GeminiErrorCode = "invalid-key" | "forbidden" | "quota" | "model-unavailable" | "blocked" | "empty" | "malformed" | "network" | "upload" | "aborted" | "temporary" | "unknown";

export class GeminiUserError extends Error {
  constructor(public readonly code: GeminiErrorCode, message: string, public readonly retryAfterMs?: number) { super(message); }
}

export function retryBackoffMs(attempt: number, random = Math.random): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt)) + Math.floor(random() * 350);
}

export function mapGeminiError(error: unknown, operation: "chat" | "upload" = "chat"): GeminiUserError {
  if (error instanceof GeminiUserError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new GeminiUserError("aborted", "Generation stopped.");
  const detail = safeErrorDetail(error);
  const status = Number((error as { status?: unknown; code?: unknown })?.status ?? (error as { code?: unknown })?.code ?? 0);
  const lower = detail.toLocaleLowerCase();
  if (status === 401 || lower.includes("api key not valid") || lower.includes("invalid api key")) return new GeminiUserError("invalid-key", "The Gemini API key is invalid. Check the key and its API restrictions.");
  if (status === 403 || lower.includes("permission_denied")) return new GeminiUserError("forbidden", "This API key is not permitted to use the selected Gemini model or Files API.");
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("quota")) return new GeminiUserError("quota", "Gemini quota is temporarily exhausted. Retry after a short pause.", retryBackoffMs(1));
  if (status === 404 || lower.includes("model") && lower.includes("not found")) return new GeminiUserError("model-unavailable", "The selected model is unavailable for this API key. Choose another fixed model in Settings.");
  if (status >= 500) return new GeminiUserError("temporary", "Gemini is temporarily unavailable. Your question remains saved; retry when ready.", retryBackoffMs(1));
  if (!navigator.onLine || lower.includes("failed to fetch") || lower.includes("network")) return new GeminiUserError("network", "Internet access was lost. Stored consultations are still available offline.");
  if (operation === "upload") return new GeminiUserError("upload", `The file could not be uploaded. ${detail || "Please retry."}`);
  return new GeminiUserError("unknown", detail || "Gemini did not complete the request.");
}

export function inspectFinishReason(finishReason?: string, blockReason?: string, hasText = false): void {
  const reason = (blockReason || finishReason || "").toUpperCase();
  if (reason.includes("SAFETY") || reason.includes("BLOCK") || reason.includes("PROHIBITED")) throw new GeminiUserError("blocked", "Gemini blocked this response because of its safety settings.");
  if (!hasText && reason) throw new GeminiUserError("empty", `Gemini ended without an answer (${reason}).`);
}
