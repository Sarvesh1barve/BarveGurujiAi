/**
 * Provisional Lahiri approximation for UI categorisation only.
 * This is deliberately labelled provisional until independently checked against
 * a licensed ephemeris/almanac fixture set. It is never represented as a certified Panchang.
 */
export function lahiriAyanamsaDegrees(date: Date): number {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const yearEnd = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  const decimalYear = date.getUTCFullYear() + (date.getTime() - yearStart) / (yearEnd - yearStart);
  return 23.85675 + 0.0139688 * (decimalYear - 2000);
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
