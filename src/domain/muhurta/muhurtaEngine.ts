import type { LocationSettings, VerifiedMuhurta } from "../../types/domain";

export const MUHURTA_PURPOSES = ["Vivah / Lagna", "Griha Pravesh", "Vastu Shanti", "Satyanarayan Puja", "Graha Shanti", "Namakaran", "Annaprashan", "Upanayan", "Vehicle purchase", "Property registration", "Business opening", "General Shubha Karya"] as const;

export interface MuhurtaRequest { purpose: typeof MUHURTA_PURPOSES[number]; location: LocationSettings; startDate: string; endDate: string; preferredTime?: string; personalised: boolean }

export interface MuhurtaSearchResult { status: "general-guidance-only"; results: VerifiedMuhurta[]; warnings: string[] }

export function findGeneralMuhurtas(request: MuhurtaRequest): MuhurtaSearchResult {
  return {
    status: "general-guidance-only",
    results: [],
    warnings: [
      `${request.purpose} selection is not yet available as a validated ruleset. No dates have been invented.`,
      `Requested range: ${request.startDate} to ${request.endDate}; location: ${request.location.name} (${request.location.timezone}).`,
      request.personalised ? "Personal birth data was requested, but personalised Muhurta needs confirmed birth charts and is not calculated in this release." : "No personal birth chart was considered.",
      "Use the local Panchang cards to review daylight periods, then confirm a final Muhurta with a qualified practitioner and trusted regional Panchang.",
    ],
  };
}
