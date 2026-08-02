export type LanguageMode = "mr" | "en" | "bilingual" | "auto";
export type EvidenceLevel = "A" | "B" | "C" | "D" | "E";
export type ContextSourceType = "local-calculation" | "uploaded-document" | "user-confirmed" | "none";

export interface LocationSettings {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isDefault: boolean;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface VerifiedPanchang {
  civilDate: string;
  vara: string;
  sunrise?: string;
  sunset?: string;
  tithi?: { index: number; name: string; paksha: "Shukla" | "Krishna"; endsAt?: string };
  nakshatra?: { index: number; name: string; endsAt?: string };
  yoga?: { index: number; name: string; endsAt?: string };
  karana?: { index: number; name: string; endsAt?: string };
  moonRashi?: { index: number; name: string };
  rahuKaal?: TimeRange;
  yamaganda?: TimeRange;
  gulikaKaal?: TimeRange;
  abhijitMuhurta?: TimeRange;
  transitions: Array<{ field: string; at: string; from: string; to: string }>;
  validationStatus: "validated-foundation" | "provisional" | "unavailable";
  unverifiedFields: string[];
}

export interface ChartPlacement {
  planet: string;
  house?: number;
  sign?: string;
  confidence: number;
  notes?: string;
}

export interface VerifiedChart {
  chartStyle: "north-indian" | "south-indian" | "east-indian" | "unknown";
  lagna?: string;
  moonSign?: string;
  placements: ChartPlacement[];
  dashaText?: string;
  annotations: string[];
  confirmedAt: string;
  sourceAttachmentId: string;
  sourceName: string;
}

export interface VerifiedMuhurta {
  id: string;
  purpose: string;
  date: string;
  time: TimeRange;
  reasons: string[];
  warnings: string[];
  personalised: boolean;
  rulesetVersion: string;
}

export interface VerifiedAgniVas {
  method: string;
  methodVersion: string;
  tithiNumber: number;
  weekdayNumber: number;
  arithmetic: string;
  remainder: number;
  result: "Prithvi" | "Akash" | "Patal";
  homaRecommendation: "recommended-under-rule" | "not-recommended-under-rule";
}

export interface VerifiedContext {
  date?: string;
  time?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  calculationMethod?: string;
  ayanamsa?: string;
  sourceType: ContextSourceType;
  sourceName?: string;
  sourcePages?: number[];
  panchang?: VerifiedPanchang;
  chart?: VerifiedChart;
  muhurta?: VerifiedMuhurta[];
  agniVas?: VerifiedAgniVas;
  warnings: string[];
}

export interface AppSettings {
  language: LanguageMode;
  model: string;
  fallbackModel: string;
  location: LocationSettings;
  ayanamsa: "lahiri";
  agniVasMethod: "tithi-vara-mod4-v1";
  idleKeyMinutes: number;
  uploadNoticeAccepted: boolean;
}
