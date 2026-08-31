/**
 * Airline reference data: display names and alliance membership.
 *
 * Providers disagree about carrier naming — Amadeus returns "TURKISH AIRLINES",
 * Travelpayouts returns only "TK". This table gives a consistent display name
 * and the alliance, which powers alliance filtering and mileage-minded search.
 */

// The canonical list lives in domain.ts as a Zod enum; re-exported here so
// airline data and request validation can never drift apart.
import type { Alliance } from "./domain.js";
export type { Alliance };

export const ALLIANCE_LABELS: Record<Alliance, string> = {
  STAR_ALLIANCE: "Star Alliance",
  SKYTEAM: "SkyTeam",
  ONEWORLD: "Oneworld",
  NONE: "No alliance",
};

export interface AirlineInfo {
  code: string;
  name: string;
  alliance: Alliance;
  /** Low-cost carriers price and bag differently; worth surfacing. */
  lowCost?: boolean;
}

const LIST: AirlineInfo[] = [
  // --- Star Alliance ---
  { code: "LH", name: "Lufthansa", alliance: "STAR_ALLIANCE" },
  { code: "LO", name: "LOT Polish Airlines", alliance: "STAR_ALLIANCE" },
  { code: "OS", name: "Austrian Airlines", alliance: "STAR_ALLIANCE" },
  { code: "LX", name: "SWISS", alliance: "STAR_ALLIANCE" },
  { code: "SN", name: "Brussels Airlines", alliance: "STAR_ALLIANCE" },
  { code: "TK", name: "Turkish Airlines", alliance: "STAR_ALLIANCE" },
  { code: "AY", name: "Finnair", alliance: "ONEWORLD" },
  { code: "SK", name: "SAS", alliance: "SKYTEAM" },
  { code: "TP", name: "TAP Air Portugal", alliance: "STAR_ALLIANCE" },
  { code: "A3", name: "Aegean Airlines", alliance: "STAR_ALLIANCE" },
  { code: "NH", name: "ANA", alliance: "STAR_ALLIANCE" },
  { code: "SQ", name: "Singapore Airlines", alliance: "STAR_ALLIANCE" },
  { code: "TG", name: "Thai Airways", alliance: "STAR_ALLIANCE" },
  { code: "OZ", name: "Asiana Airlines", alliance: "STAR_ALLIANCE" },
  { code: "CA", name: "Air China", alliance: "STAR_ALLIANCE" },
  { code: "AC", name: "Air Canada", alliance: "STAR_ALLIANCE" },
  { code: "UA", name: "United Airlines", alliance: "STAR_ALLIANCE" },
  { code: "SU", name: "Aeroflot", alliance: "NONE" },

  // --- SkyTeam ---
  { code: "AF", name: "Air France", alliance: "SKYTEAM" },
  { code: "KL", name: "KLM", alliance: "SKYTEAM" },
  { code: "AZ", name: "ITA Airways", alliance: "SKYTEAM" },
  { code: "RO", name: "TAROM", alliance: "SKYTEAM" },
  { code: "KE", name: "Korean Air", alliance: "SKYTEAM" },
  { code: "CI", name: "China Airlines", alliance: "SKYTEAM" },
  { code: "MU", name: "China Eastern", alliance: "SKYTEAM" },
  { code: "CZ", name: "China Southern", alliance: "NONE" },
  { code: "VN", name: "Vietnam Airlines", alliance: "SKYTEAM" },
  { code: "GA", name: "Garuda Indonesia", alliance: "SKYTEAM" },
  { code: "DL", name: "Delta Air Lines", alliance: "SKYTEAM" },
  { code: "VS", name: "Virgin Atlantic", alliance: "SKYTEAM" },
  { code: "ME", name: "Middle East Airlines", alliance: "SKYTEAM" },
  { code: "SV", name: "Saudia", alliance: "SKYTEAM" },
  { code: "KQ", name: "Kenya Airways", alliance: "SKYTEAM" },

  // --- Oneworld ---
  { code: "BA", name: "British Airways", alliance: "ONEWORLD" },
  { code: "IB", name: "Iberia", alliance: "ONEWORLD" },
  { code: "AA", name: "American Airlines", alliance: "ONEWORLD" },
  { code: "QR", name: "Qatar Airways", alliance: "ONEWORLD" },
  { code: "CX", name: "Cathay Pacific", alliance: "ONEWORLD" },
  { code: "JL", name: "Japan Airlines", alliance: "ONEWORLD" },
  { code: "QF", name: "Qantas", alliance: "ONEWORLD" },
  { code: "MH", name: "Malaysia Airlines", alliance: "ONEWORLD" },
  { code: "RJ", name: "Royal Jordanian", alliance: "ONEWORLD" },
  { code: "UL", name: "SriLankan Airlines", alliance: "ONEWORLD" },
  { code: "AT", name: "Royal Air Maroc", alliance: "ONEWORLD" },

  // --- Unaligned full service ---
  { code: "EK", name: "Emirates", alliance: "NONE" },
  { code: "EY", name: "Etihad Airways", alliance: "NONE" },
  { code: "HU", name: "Hainan Airlines", alliance: "NONE" },
  { code: "PS", name: "Ukraine International", alliance: "NONE" },
  { code: "FZ", name: "flydubai", alliance: "NONE" },
  { code: "GF", name: "Gulf Air", alliance: "NONE" },
  { code: "AI", name: "Air India", alliance: "STAR_ALLIANCE" },
  { code: "BR", name: "EVA Air", alliance: "STAR_ALLIANCE" },
  { code: "PR", name: "Philippine Airlines", alliance: "NONE" },
  { code: "UZ", name: "Uzbekistan Airways", alliance: "NONE" },

  // --- Low cost ---
  { code: "FR", name: "Ryanair", alliance: "NONE", lowCost: true },
  { code: "W6", name: "Wizz Air", alliance: "NONE", lowCost: true },
  { code: "U2", name: "easyJet", alliance: "NONE", lowCost: true },
  { code: "VY", name: "Vueling", alliance: "NONE", lowCost: true },
  { code: "PC", name: "Pegasus Airlines", alliance: "NONE", lowCost: true },
  { code: "DY", name: "Norwegian", alliance: "NONE", lowCost: true },
  { code: "EW", name: "Eurowings", alliance: "NONE", lowCost: true },
  { code: "AK", name: "AirAsia", alliance: "NONE", lowCost: true },
  { code: "D8", name: "Norse Atlantic", alliance: "NONE", lowCost: true },
  { code: "TO", name: "Transavia France", alliance: "NONE", lowCost: true },
];

const BY_CODE = new Map(LIST.map((a) => [a.code, a]));

export function airlineInfo(code: string): AirlineInfo | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Display name for a code, falling back to the code when unknown. */
export function airlineName(code: string, fallback?: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? fallback ?? code;
}

export function allianceOf(code: string): Alliance {
  return BY_CODE.get(code.toUpperCase())?.alliance ?? "NONE";
}

export function isLowCost(code: string): boolean {
  return BY_CODE.get(code.toUpperCase())?.lowCost === true;
}

export function allAirlines(): AirlineInfo[] {
  return [...LIST].sort((a, b) => a.name.localeCompare(b.name));
}

export function airlinesInAlliance(alliance: Alliance): AirlineInfo[] {
  return LIST.filter((a) => a.alliance === alliance);
}
