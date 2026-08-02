import type { TimeRange } from "../../types/domain";

const RAHU_SEGMENT = [8, 2, 7, 5, 6, 4, 3];
const YAMAGANDA_SEGMENT = [5, 4, 3, 2, 1, 7, 6];
const GULIKA_SEGMENT = [7, 6, 5, 4, 3, 2, 1];

function formatMinutes(value: number): string {
  const normalized = (value + 1440) % 1440;
  const hours = Math.floor(normalized / 60).toString().padStart(2, "0");
  const minutes = Math.round(normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function daylightSegment(sunriseMinutes: number, sunsetMinutes: number, segment: number): TimeRange {
  if (segment < 1 || segment > 8 || sunsetMinutes <= sunriseMinutes) throw new Error("Invalid daylight division inputs.");
  const length = (sunsetMinutes - sunriseMinutes) / 8;
  return { start: formatMinutes(sunriseMinutes + (segment - 1) * length), end: formatMinutes(sunriseMinutes + segment * length) };
}

export function calculateDayPeriods(weekday: number, sunriseMinutes: number, sunsetMinutes: number): { rahuKaal: TimeRange; yamaganda: TimeRange; gulikaKaal: TimeRange; abhijitMuhurta: TimeRange } {
  const rahu = RAHU_SEGMENT[weekday];
  const yama = YAMAGANDA_SEGMENT[weekday];
  const gulika = GULIKA_SEGMENT[weekday];
  if (!rahu || !yama || !gulika) throw new Error("Invalid weekday.");
  const noon = (sunriseMinutes + sunsetMinutes) / 2;
  const abhijitHalf = (sunsetMinutes - sunriseMinutes) / 30;
  return {
    rahuKaal: daylightSegment(sunriseMinutes, sunsetMinutes, rahu),
    yamaganda: daylightSegment(sunriseMinutes, sunsetMinutes, yama),
    gulikaKaal: daylightSegment(sunriseMinutes, sunsetMinutes, gulika),
    abhijitMuhurta: { start: formatMinutes(noon - abhijitHalf), end: formatMinutes(noon + abhijitHalf) },
  };
}
