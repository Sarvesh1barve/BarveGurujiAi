import type { VerifiedMuhurta } from "../../types/domain";

function icsEscape(value: string): string { return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); }
function stamp(value: string): string { return value.replace(/[-:]/g, "").replace(/\[.*$/, ""); }

export function createMuhurtaIcs(result: VerifiedMuhurta, timezone: string): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Barve Guruji AI//Verified Muhurta//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${result.id}@barve-guruji.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`, `DTSTART;TZID=${timezone}:${stamp(`${result.date}T${result.time.start}:00`)}`, `DTEND;TZID=${timezone}:${stamp(`${result.date}T${result.time.end}:00`)}`, `SUMMARY:${icsEscape(result.purpose)}`, `DESCRIPTION:${icsEscape([...result.reasons, ...result.warnings].join("\n"))}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
