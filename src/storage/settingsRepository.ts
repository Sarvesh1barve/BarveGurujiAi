import type { AppSettings } from "../types/domain";

const SETTINGS_KEY = "bg_settings_v2";
const SESSION_KEY = "bg_api_key_session";
const REMEMBERED_KEY = "bg_api_key_remembered";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "mr",
  model: "gemini-2.5-flash",
  fallbackModel: "gemini-2.5-flash-lite",
  location: { name: "Pune (default)", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata", isDefault: true },
  ayanamsa: "lahiri",
  agniVasMethod: "tithi-vara-mod4-v1",
  idleKeyMinutes: 0,
  uploadNoticeAccepted: false,
};

export function getSettings(): AppSettings {
  let stored: Partial<AppSettings> = {};
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"); } catch { stored = {}; }
  const migratedLanguage = localStorage.getItem("bg_migrated_language");
  const language = stored.language ?? (migratedLanguage === "en" ? "en" : "mr");
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    language,
    location: { ...DEFAULT_SETTINGS.location, ...(stored.location ?? {}) },
  };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getApiKey(): string {
  return (sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(REMEMBERED_KEY) ?? "").trim();
}

export function hasRememberedApiKey(): boolean {
  return Boolean(localStorage.getItem(REMEMBERED_KEY));
}

export function setApiKey(key: string, remember: boolean): void {
  const clean = key.trim();
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBERED_KEY);
  if (!clean) return;
  if (remember) localStorage.setItem(REMEMBERED_KEY, clean);
  else sessionStorage.setItem(SESSION_KEY, clean);
}

export function forgetApiKey(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBERED_KEY);
}
