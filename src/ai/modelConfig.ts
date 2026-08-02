export const DEFAULT_MODEL = "gemini-2.5-flash";
export const FALLBACK_MODEL = "gemini-2.5-flash-lite";
export const MAX_HISTORY_MESSAGES = 24;
export const MAX_HISTORY_CHARACTERS = 60_000;

export function isSafeModelName(value: string): boolean {
  return /^gemini-[a-z0-9.-]{3,80}$/i.test(value) && !value.toLocaleLowerCase().includes("latest");
}
