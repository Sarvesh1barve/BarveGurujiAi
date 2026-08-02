export interface AgniVasRule {
  id: "tithi-vara-mod4-v1";
  name: string;
  version: string;
  description: string;
  source: string;
  weekdayNumbering: "Sunday=1";
}

export const AGNI_VAS_RULE: AgniVasRule = {
  id: "tithi-vara-mod4-v1",
  name: "Tithi–Vara modulo-four method",
  version: "1.0.0",
  description: "Add the lunar tithi number, weekday number (Sunday=1), and one; divide by four and map the remainder.",
  source: "https://www.drikpanchang.com/panchang/info/agnivasa/agnivasa.html",
  weekdayNumbering: "Sunday=1",
};
