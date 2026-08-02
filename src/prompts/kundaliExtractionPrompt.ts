export const KUNDALI_EXTRACTION_PROMPT = `Extract only information that is visibly present in the attached Kundali image or report.

Do not interpret, predict, infer obscured values, or silently repair an uncertain chart. Use null or an ambiguity entry for anything unreadable. Confidence is a number from 0 to 1 and must reflect actual legibility. For PDF sources, use a page number only when it can be established; otherwise use null.

Return JSON matching the supplied schema. Planet/sign names may use the source language. The user will review and correct every field before the application treats it as verified.`;

export const KUNDALI_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chartStyle", "orientation", "houses", "placements", "annotations", "ambiguities", "overallConfidence"],
  properties: {
    chartStyle: { type: "string", enum: ["north-indian", "south-indian", "east-indian", "unknown"] },
    orientation: { type: ["string", "null"] },
    lagna: { type: ["string", "null"] },
    moonSign: { type: ["string", "null"] },
    houses: { type: "array", items: { type: "object", required: ["house", "confidence"], properties: { house: { type: "integer", minimum: 1, maximum: 12 }, sign: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 } } } },
    placements: { type: "array", items: { type: "object", required: ["planet", "confidence"], properties: { planet: { type: "string" }, house: { type: ["integer", "null"], minimum: 1, maximum: 12 }, sign: { type: ["string", "null"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, notes: { type: ["string", "null"] } } } },
    dashaText: { type: ["string", "null"] },
    annotations: { type: "array", items: { type: "string" } },
    ambiguities: { type: "array", items: { type: "object", required: ["field", "reason"], properties: { field: { type: "string" }, reason: { type: "string" }, page: { type: ["integer", "null"] } } } },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;
