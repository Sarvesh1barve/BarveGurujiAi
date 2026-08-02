import { addCivilDays, dateInTimezone, resolveRelativeDate } from "../src/utils/dateResolution";

describe("relative date resolution", () => {
  const beforeIstMidnight = new Date("2026-08-01T18:20:00.000Z");
  const afterIstMidnight = new Date("2026-08-01T18:40:00.000Z");

  it("uses the Asia/Kolkata civil-date boundary", () => {
    expect(dateInTimezone(beforeIstMidnight, "Asia/Kolkata")).toBe("2026-08-01");
    expect(dateInTimezone(afterIstMidnight, "Asia/Kolkata")).toBe("2026-08-02");
  });

  it.each([
    ["today please", 0, "2026-08-02"], ["आजचे पंचांग", 0, "2026-08-02"], ["tomorrow", 1, "2026-08-03"],
    ["उद्या हवन", 1, "2026-08-03"], ["udya", 1, "2026-08-03"], ["परवा", 2, "2026-08-04"], ["day after tomorrow", 2, "2026-08-04"],
  ])("resolves %s deterministically", (text, offset, expected) => {
    const result = resolveRelativeDate(text, afterIstMidnight, "Asia/Kolkata");
    expect(result.offsetDays).toBe(offset); expect(result.date).toBe(expected); expect(result.resolvedText).toContain(expected);
  });

  it("adds civil days without daylight-saving drift", () => { expect(addCivilDays("2024-02-28", 1)).toBe("2024-02-29"); });
});
