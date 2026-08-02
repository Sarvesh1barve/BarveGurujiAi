import { calculateDayPeriods, daylightSegment } from "../src/domain/panchang/dayPeriods";
import { calculatePanchang } from "../src/domain/panchang/panchangEngine";
import { zonedDateTimeToUtc } from "../src/domain/panchang/timezone";

describe("Panchang deterministic foundation", () => {
  it("divides daylight into the traditional eight Rahu Kaal segments", () => {
    expect(daylightSegment(360, 1080, 1)).toEqual({ start: "06:00", end: "07:30" });
    expect(calculateDayPeriods(1, 360, 1080).rahuKaal).toEqual({ start: "07:30", end: "09:00" });
    expect(calculateDayPeriods(0, 360, 1080).rahuKaal).toEqual({ start: "16:30", end: "18:00" });
  });
  it("converts local midnight across timezone boundaries", () => { expect(zonedDateTimeToUtc("2026-08-02", "00:00:00", "Asia/Kolkata").toISOString()).toBe("2026-08-01T18:30:00.000Z"); });
  it.each([
    ["2026-01-15", { name: "Pune", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata", isDefault: false }],
    ["2026-07-15", { name: "London", latitude: 51.5072, longitude: -0.1276, timezone: "Europe/London", isDefault: false }],
  ])("calculates local sunrise and bounded transitions for %s", (date, location) => {
    const context = calculatePanchang(date, location); expect(context.locationName).toBe(location.name); expect(context.panchang?.sunrise).toContain(date.split("-").reverse().join("/")); expect(context.panchang?.tithi?.index).toBeGreaterThanOrEqual(1); expect(context.panchang?.tithi?.index).toBeLessThanOrEqual(30); expect(context.panchang?.nakshatra?.index).toBeGreaterThanOrEqual(1); expect(context.panchang?.nakshatra?.index).toBeLessThanOrEqual(27); expect(context.panchang?.validationStatus).toBe("provisional");
  });
});
