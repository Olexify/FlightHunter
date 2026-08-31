/**
 * Curated route corridors. The app searches anywhere in the world; these are
 * one-click starting points for the hunts people actually run. Users can save
 * their own alongside these (see CustomPreset).
 */
export type PresetCategory = "asia" | "americas" | "europe" | "beach" | "domestic";

export interface RoutePreset {
  id: string;
  label: string;
  category: PresetCategory;
  description: string;
  origins: string[];
  destinations: string[];
}

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  asia: "Asia",
  americas: "Americas",
  europe: "Europe",
  beach: "Sun & beach",
  domestic: "Regional",
};

export const ROUTE_PRESETS: RoutePreset[] = [
  /* ------------------------------- Asia ------------------------------- */
  {
    id: "europe-japan",
    label: "Europe → Japan",
    category: "asia",
    description: "The classic hunt: cheap Central/Eastern European hubs into every Japanese gateway.",
    origins: ["IST", "BUD", "WAW", "PRG", "VIE", "KRK", "FRA", "MUC", "CDG", "AMS", "HEL"],
    destinations: ["NRT", "HND", "KIX", "NGO", "FUK", "CTS"],
  },
  {
    id: "europe-korea",
    label: "Europe → South Korea",
    category: "asia",
    description: "Seoul and Busan from the major European departure points.",
    origins: ["IST", "WAW", "PRG", "VIE", "FRA", "CDG", "AMS", "LHR", "HEL"],
    destinations: ["ICN", "GMP", "PUS"],
  },
  {
    id: "europe-southeast-asia",
    label: "Europe → Southeast Asia",
    category: "asia",
    description: "Bangkok, Singapore, Bali and Vietnam from the cheapest European departure points.",
    origins: ["IST", "BUD", "WAW", "PRG", "VIE", "FRA", "CDG", "AMS", "LHR"],
    destinations: ["BKK", "SIN", "DPS", "KUL", "SGN", "HAN"],
  },
  {
    id: "europe-china",
    label: "Europe → China",
    category: "asia",
    description: "Beijing, Shanghai, Guangzhou and Chengdu.",
    origins: ["IST", "WAW", "FRA", "MUC", "CDG", "AMS", "LHR", "HEL"],
    destinations: ["PEK", "PVG", "CAN", "CTU", "SZX"],
  },
  {
    id: "europe-india",
    label: "Europe → India",
    category: "asia",
    description: "Delhi, Mumbai, Bengaluru and the southern gateways.",
    origins: ["IST", "WAW", "FRA", "CDG", "AMS", "LHR", "VIE"],
    destinations: ["DEL", "BOM", "BLR", "MAA", "HYD", "COK"],
  },
  {
    id: "europe-gulf",
    label: "Europe → Gulf",
    category: "asia",
    description: "Dubai, Doha, Abu Dhabi — good value stopovers as well as destinations.",
    origins: ["IST", "WAW", "BUD", "PRG", "VIE", "FRA", "CDG", "AMS", "LHR"],
    destinations: ["DXB", "DOH", "AUH", "RUH", "JED"],
  },

  /* ----------------------------- Americas ----------------------------- */
  {
    id: "europe-usa-east",
    label: "Europe → US East Coast",
    category: "americas",
    description: "Transatlantic into New York, Boston, Washington and Miami.",
    origins: ["LHR", "CDG", "AMS", "FRA", "MAD", "DUB", "LIS", "WAW", "IST"],
    destinations: ["JFK", "EWR", "BOS", "IAD", "MIA", "PHL"],
  },
  {
    id: "europe-usa-west",
    label: "Europe → US West Coast",
    category: "americas",
    description: "The long haul to California and the Pacific Northwest.",
    origins: ["LHR", "CDG", "AMS", "FRA", "MAD", "IST", "WAW"],
    destinations: ["LAX", "SFO", "SEA", "LAS", "SAN"],
  },
  {
    id: "europe-canada",
    label: "Europe → Canada",
    category: "americas",
    description: "Toronto, Montreal and Vancouver.",
    origins: ["LHR", "CDG", "AMS", "FRA", "DUB", "WAW"],
    destinations: ["YYZ", "YUL", "YVR", "YYC"],
  },
  {
    id: "europe-latam",
    label: "Europe → Latin America",
    category: "americas",
    description: "Brazil, Argentina, Mexico and Colombia.",
    origins: ["MAD", "LIS", "CDG", "AMS", "FRA", "LHR", "IST"],
    destinations: ["GRU", "EZE", "MEX", "BOG", "LIM", "SCL"],
  },

  /* ------------------------------ Europe ------------------------------ */
  {
    id: "poland-europe",
    label: "Poland → Europe",
    category: "europe",
    description: "Every Polish airport into the major Western European cities.",
    origins: ["WAW", "WMI", "KRK", "GDN", "WRO", "POZ", "KTW"],
    destinations: ["LHR", "CDG", "AMS", "FRA", "BCN", "MXP", "MAD", "LIS"],
  },
  {
    id: "uk-europe",
    label: "UK → Europe",
    category: "europe",
    description: "All London-area and regional UK airports into continental hubs.",
    origins: ["LHR", "LGW", "STN", "LTN", "MAN", "EDI", "BRS", "BHX"],
    destinations: ["AMS", "CDG", "BCN", "FCO", "BER", "PRG", "LIS", "DUB"],
  },
  {
    id: "europe-nordics",
    label: "Europe → Nordics",
    category: "europe",
    description: "Scandinavia, Iceland and the Baltics.",
    origins: ["WAW", "BER", "AMS", "LHR", "FRA", "CDG"],
    destinations: ["ARN", "OSL", "CPH", "HEL", "KEF", "TLL", "RIX"],
  },
  {
    id: "europe-balkans",
    label: "Europe → Balkans",
    category: "europe",
    description: "Croatia, Serbia, Greece, Albania and Montenegro.",
    origins: ["WAW", "VIE", "BUD", "MUC", "BER", "AMS", "LHR"],
    destinations: ["SPU", "DBV", "ZAG", "BEG", "ATH", "TIA", "TGD", "SKP"],
  },
  {
    id: "europe-turkey-caucasus",
    label: "Europe → Turkey & Caucasus",
    category: "europe",
    description: "Istanbul, Antalya, Tbilisi, Yerevan and Baku.",
    origins: ["WAW", "KRK", "BUD", "PRG", "VIE", "BER", "AMS"],
    destinations: ["IST", "SAW", "AYT", "TBS", "EVN", "GYD"],
  },

  /* ---------------------------- Sun & beach --------------------------- */
  {
    id: "mediterranean",
    label: "Mediterranean sun",
    category: "beach",
    description: "Spain, Greece, Italy and Portugal beach destinations.",
    origins: ["WAW", "KRK", "LHR", "MAN", "BER", "AMS", "VIE", "PRG"],
    destinations: ["BCN", "AGP", "PMI", "ALC", "FAO", "ATH", "NAP", "CTA", "HER"],
  },
  {
    id: "canaries-madeira",
    label: "Canaries & Madeira",
    category: "beach",
    description: "Winter sun in the Atlantic islands.",
    origins: ["WAW", "LHR", "MAN", "BER", "AMS", "CDG", "MAD"],
    destinations: ["TFS", "LPA", "ACE", "FUE", "FNC"],
  },
  {
    id: "indian-ocean",
    label: "Indian Ocean",
    category: "beach",
    description: "Maldives, Mauritius, Seychelles and Zanzibar.",
    origins: ["IST", "WAW", "FRA", "CDG", "AMS", "LHR", "VIE"],
    destinations: ["MLE", "MRU", "SEZ", "ZNZ"],
  },
  {
    id: "egypt-red-sea",
    label: "Egypt & Red Sea",
    category: "beach",
    description: "Hurghada, Sharm el-Sheikh and Marsa Alam.",
    origins: ["WAW", "KRK", "KTW", "BUD", "PRG", "VIE", "BER"],
    destinations: ["HRG", "SSH", "RMF", "CAI"],
  },

  /* ----------------------------- Regional ----------------------------- */
  {
    id: "japan-domestic",
    label: "Tokyo → Japan domestic",
    category: "domestic",
    description: "Getting around Japan once you have landed.",
    origins: ["HND", "NRT"],
    destinations: ["CTS", "FUK", "OKA", "KIX", "ITM", "HIJ", "SDJ", "KMJ"],
  },
  {
    id: "southeast-asia-hop",
    label: "Southeast Asia hopping",
    category: "domestic",
    description: "Short hops between the region's main cities.",
    origins: ["BKK", "SIN", "KUL"],
    destinations: ["DPS", "SGN", "HAN", "PNH", "RGN", "MNL", "CEB", "HKT"],
  },
  {
    id: "usa-domestic",
    label: "US transcontinental",
    category: "domestic",
    description: "Coast to coast across the United States.",
    origins: ["JFK", "EWR", "BOS", "IAD"],
    destinations: ["LAX", "SFO", "SEA", "LAS", "DEN"],
  },
];

export const DEFAULT_PRESET_ID = "europe-japan";

export function presetsByCategory(): Array<{ category: PresetCategory; presets: RoutePreset[] }> {
  const order: PresetCategory[] = ["asia", "americas", "europe", "beach", "domestic"];
  return order
    .map((category) => ({ category, presets: ROUTE_PRESETS.filter((p) => p.category === category) }))
    .filter((g) => g.presets.length > 0);
}

/** Currencies offered in the picker. Anything ISO-4217 works via the API. */
export const COMMON_CURRENCIES = [
  "EUR", "USD", "GBP", "PLN", "JPY", "UAH", "CZK", "HUF", "TRY", "CHF",
  "SEK", "NOK", "DKK", "AUD", "CAD", "AED", "SGD", "THB", "KRW", "CNY",
] as const;
