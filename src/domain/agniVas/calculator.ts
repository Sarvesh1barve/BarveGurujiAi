import { AGNI_VAS_RULE } from "./rules";

export type AgniVasLocation = "Prithvi" | "Akash" | "Patal";

export interface AgniVasResult {
  rule: typeof AGNI_VAS_RULE;
  tithiNumber: number;
  weekdayNumber: number;
  arithmetic: string;
  remainder: 0 | 1 | 2 | 3;
  location: AgniVasLocation;
  homaRecommendation: "recommended-under-rule" | "not-recommended-under-rule";
  warning: string;
}

export function calculateAgniVas(tithiNumber: number, weekdayNumber: number): AgniVasResult {
  if (!Number.isInteger(tithiNumber) || tithiNumber < 1 || tithiNumber > 30) throw new Error("Tithi number must be 1–30.");
  if (!Number.isInteger(weekdayNumber) || weekdayNumber < 1 || weekdayNumber > 7) throw new Error("Weekday number must be 1–7 (Sunday=1). ");
  const total = tithiNumber + weekdayNumber + 1;
  const remainder = total % 4 as 0 | 1 | 2 | 3;
  const location: AgniVasLocation = remainder === 0 || remainder === 3 ? "Prithvi" : remainder === 1 ? "Akash" : "Patal";
  return {
    rule: AGNI_VAS_RULE, tithiNumber, weekdayNumber,
    arithmetic: `(${tithiNumber} + ${weekdayNumber} + 1) ÷ 4 = remainder ${remainder}`,
    remainder, location,
    homaRecommendation: location === "Prithvi" ? "recommended-under-rule" : "not-recommended-under-rule",
    warning: "This result follows the selected traditional rule only. Local Sampradaya, family practice, and exceptions for Nitya/naimittika rites can differ; consult your priest for an actual ritual.",
  };
}
