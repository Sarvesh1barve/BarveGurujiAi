import { GoogleGenAI } from "@google/genai";
import type { StoredAttachment } from "../types/storage";
import { attachmentsToParts } from "./attachmentService";
import { KUNDALI_EXTRACTION_PROMPT, KUNDALI_EXTRACTION_SCHEMA } from "../prompts/kundaliExtractionPrompt";
import { mapGeminiError } from "./responseErrors";

export interface KundaliExtraction {
  chartStyle: "north-indian" | "south-indian" | "east-indian" | "unknown";
  orientation: string | null;
  lagna?: string | null;
  moonSign?: string | null;
  houses: Array<{ house: number; sign?: string | null; confidence: number }>;
  placements: Array<{ planet: string; house?: number | null; sign?: string | null; confidence: number; notes?: string | null }>;
  dashaText?: string | null;
  annotations: string[];
  ambiguities: Array<{ field: string; reason: string; page?: number | null }>;
  overallConfidence: number;
}

export function validateKundaliExtraction(value: unknown): value is KundaliExtraction {
  if (!value || typeof value !== "object") return false;
  const item = value as KundaliExtraction;
  return ["north-indian", "south-indian", "east-indian", "unknown"].includes(item.chartStyle)
    && Array.isArray(item.houses) && Array.isArray(item.placements) && Array.isArray(item.annotations)
    && Array.isArray(item.ambiguities) && Number.isFinite(item.overallConfidence)
    && item.overallConfidence >= 0 && item.overallConfidence <= 1
    && item.placements.every((placement) => typeof placement.planet === "string" && placement.confidence >= 0 && placement.confidence <= 1);
}

export async function extractKundali(apiKey: string, model: string, attachment: StoredAttachment, signal: AbortSignal, onStatus: (status: string) => void): Promise<KundaliExtraction> {
  try {
    onStatus("Reading Kundali");
    const parts = await attachmentsToParts(apiKey, [attachment], signal, onStatus);
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: `${KUNDALI_EXTRACTION_PROMPT}\nSource file: ${attachment.fileName}` }, ...parts] }],
      config: { responseMimeType: "application/json", responseJsonSchema: KUNDALI_EXTRACTION_SCHEMA, temperature: 0, abortSignal: signal },
    });
    const parsed = JSON.parse(response.text ?? "null") as unknown;
    if (!validateKundaliExtraction(parsed)) throw new Error("Gemini returned malformed Kundali extraction data.");
    return parsed;
  } catch (error) { throw mapGeminiError(error); }
}
