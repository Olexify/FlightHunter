/**
 * Curated corridors. The app searches anywhere in the world; these are just
 * one-click starting points, with the original Europe → Japan hunt as default.
 */
export interface RoutePreset {
  id: string;
  label: string;
  description: string;
  origins: string[];
  destinations: string[];
}

export const ROUTE_PRESETS: RoutePreset[] = [
  {
    id: "europe-japan",
    label: "Europe → Japan",
    description: "The classic hunt: cheap Central/Eastern European hubs into every major Japanese gateway.",
    origins: ["IST", "BUD", "WAW", "PRG", "VIE", "KRK", "FRA", "MUC", "CDG", "AMS", "HEL"],
    destinations: ["NRT", "HND", "KIX", "NGO", "FUK", "CTS"],
  },
  {
    id: "europe-southeast-asia",
    label: "Europe → Southeast Asia",
    description: "Bangkok, Singapore, Bali and Vietnam from the cheapest European departure points.",
    origins: ["IST", "BUD", "WAW", "PRG", "VIE", "FRA", "CDG", "AMS", "LHR"],
    destinations: ["BKK", "SIN", "DPS", "KUL", "SGN", "HAN"],
  },
  {
    id: "europe-usa",
    label: "Europe → USA",
    description: "Transatlantic into the big US entry points.",
    origins: ["LHR", "CDG", "AMS", "FRA", "MAD", "DUB", "LIS", "WAW"],
    destinations: ["JFK", "EWR", "BOS", "ORD", "LAX", "SFO", "MIA"],
  },
  {
    id: "uk-europe-sun",
    label: "UK → Mediterranean",
    description: "Short-haul sun routes out of every London-area and regional UK airport.",
    origins: ["LHR", "LGW", "STN", "LTN", "MAN", "EDI", "BRS"],
    destinations: ["BCN", "AGP", "PMI", "ALC", "FAO", "ATH", "NAP"],
  },
  {
    id: "japan-domestic",
    label: "Tokyo → Japan domestic",
    description: "Getting around Japan once you have landed.",
    origins: ["HND", "NRT"],
    destinations: ["CTS", "FUK", "OKA", "KIX", "ITM", "HIJ", "SDJ"],
  },
];

export const DEFAULT_PRESET_ID = "europe-japan";

/** Currencies offered in the picker. Anything ISO-4217 works via the API. */
export const COMMON_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "PLN",
  "JPY",
  "UAH",
  "CZK",
  "HUF",
  "TRY",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "AUD",
  "CAD",
] as const;
