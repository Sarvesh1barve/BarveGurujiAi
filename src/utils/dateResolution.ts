const RELATIVE_PATTERNS: Array<{ offset: number; pattern: RegExp }> = [
  { offset: 2, pattern: /\bday\s+after\s+tomorrow\b|परवा|\bparva\b/iu },
  { offset: 1, pattern: /\btomorrow\b|उद्या|\budya\b/iu },
  { offset: 0, pattern: /\btoday\b|आज|\baaj\b/iu },
];

export interface ResolvedDateReference {
  original: string;
  resolvedText: string;
  date?: string;
  offsetDays?: number;
  timezone: string;
}

export function dateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addCivilDays(dateIso: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateIso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function resolveRelativeDate(
  text: string,
  now = new Date(),
  timezone = "Asia/Kolkata",
): ResolvedDateReference {
  const match = RELATIVE_PATTERNS.find(({ pattern }) => pattern.test(text));
  if (!match) return { original: text, resolvedText: text, timezone };

  const date = addCivilDays(dateInTimezone(now, timezone), match.offset);
  const resolvedText = text.replace(match.pattern, (word) => `${word} (${date}, ${timezone})`);
  return { original: text, resolvedText, date, offsetDays: match.offset, timezone };
}

export function localDateTimeIso(date: string, minutes: number, timezone: string): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = Math.round(minutes % 60).toString().padStart(2, "0");
  return `${date}T${hours}:${mins}:00[${timezone}]`;
}
