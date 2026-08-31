import type {
  Alliance,
  CabinClass,
  FareBrand,
  RankingWeights,
  SearchRequestInput,
  SortKey,
} from "@flighthunter/shared";
import { todayPlus } from "@flighthunter/shared";
import { DEFAULT_SETTINGS, type Settings } from "./hooks/useSettings";

/**
 * The search form, mirrored into the URL so a hunt can be bookmarked or shared.
 * Only non-default values are written, keeping links short and readable.
 */
export interface FormState {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  currency: string;
  maxStops: number | null;
  flexDays: number;
  nearbyRadiusKm: number;
  maxPerPair: number;

  includeAirlines: string[];
  excludeAirlines: string[];
  alliances: Alliance[];
  fareBrands: FareBrand[];
  requireCheckedBag: boolean;
  excludeLowCost: boolean;

  viaAirports: string[];
  avoidAirports: string[];
  maxSegments: number | null;
  avoidRedEye: boolean;

  departAfter: string;
  departBefore: string;
  arriveAfter: string;
  arriveBefore: string;
  minLayoverMinutes: number | null;
  maxLayoverMinutes: number | null;

  maxDurationHours: number | null;
  maxPrice: number | null;
  sort: SortKey;
}

/** A blank form, seeded from the user's saved preferences. */
export function defaultForm(settings: Settings = DEFAULT_SETTINGS): FormState {
  return {
    origins: ["WAW", "IST", "BUD", "PRG", "VIE"],
    destinations: ["NRT", "HND", "KIX"],
    // Local date, not UTC — `toISOString()` shifted this a day for anyone
    // east of Greenwich in the evening.
    departureDate: todayPlus(45),
    returnDate: "",
    adults: settings.defaultAdults,
    children: 0,
    infants: 0,
    cabin: settings.defaultCabin,
    currency: settings.defaultCurrency,
    maxStops: settings.defaultMaxStops,
    flexDays: settings.defaultFlexDays,
    nearbyRadiusKm: 0,
    maxPerPair: settings.maxPerPair,

    includeAirlines: [],
    excludeAirlines: [],
    alliances: [],
    fareBrands: [],
    requireCheckedBag: false,
    excludeLowCost: false,

    viaAirports: [],
    avoidAirports: [],
    maxSegments: null,
    avoidRedEye: false,

    departAfter: "",
    departBefore: "",
    arriveAfter: "",
    arriveBefore: "",
    minLayoverMinutes: null,
    maxLayoverMinutes: null,

    maxDurationHours: null,
    maxPrice: null,
    sort: settings.defaultSort,
  };
}

const CABINS: CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
const SORTS: SortKey[] = ["best", "price", "duration", "stops", "departure", "arrival"];
const ALLIANCES: Alliance[] = ["STAR_ALLIANCE", "SKYTEAM", "ONEWORLD", "NONE"];
const BRANDS: FareBrand[] = ["BASIC", "STANDARD", "FLEX"];

const list = (v: string | null): string[] =>
  v ? v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];

const int = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const bool = (v: string | null): boolean => v === "1" || v === "true";

/** Rebuild the form from a query string, falling back to defaults per field. */
export function formFromSearchParams(search: string, settings: Settings = DEFAULT_SETTINGS): FormState {
  const p = new URLSearchParams(search);
  const d = defaultForm(settings);
  if ([...p.keys()].length === 0) return d;

  const cabin = p.get("cabin");
  const sort = p.get("sort");
  const stops = int(p.get("maxStops"));

  return {
    ...d,
    origins: list(p.get("from")).length > 0 ? list(p.get("from")) : d.origins,
    destinations: list(p.get("to")).length > 0 ? list(p.get("to")) : d.destinations,
    departureDate: p.get("depart") ?? d.departureDate,
    returnDate: p.get("return") ?? "",
    adults: int(p.get("adults")) ?? d.adults,
    children: int(p.get("children")) ?? 0,
    infants: int(p.get("infants")) ?? 0,
    cabin: CABINS.includes(cabin as CabinClass) ? (cabin as CabinClass) : d.cabin,
    currency: (p.get("currency") ?? d.currency).toUpperCase(),
    maxStops: p.get("maxStops") === "any" ? null : (stops ?? d.maxStops),
    flexDays: int(p.get("flex")) ?? d.flexDays,
    nearbyRadiusKm: int(p.get("nearby")) ?? 0,
    maxPerPair: int(p.get("perRoute")) ?? d.maxPerPair,

    includeAirlines: list(p.get("include")),
    excludeAirlines: list(p.get("exclude")),
    alliances: list(p.get("alliances")).filter((a): a is Alliance => ALLIANCES.includes(a as Alliance)),
    fareBrands: list(p.get("brands")).filter((b): b is FareBrand => BRANDS.includes(b as FareBrand)),
    requireCheckedBag: bool(p.get("bag")),
    excludeLowCost: bool(p.get("noLcc")),

    viaAirports: list(p.get("via")),
    avoidAirports: list(p.get("avoid")),
    maxSegments: int(p.get("maxSegments")),
    avoidRedEye: bool(p.get("noRedEye")),

    departAfter: p.get("departAfter") ?? "",
    departBefore: p.get("departBefore") ?? "",
    arriveAfter: p.get("arriveAfter") ?? "",
    arriveBefore: p.get("arriveBefore") ?? "",
    minLayoverMinutes: int(p.get("minLayover")),
    maxLayoverMinutes: int(p.get("maxLayover")),

    maxDurationHours: int(p.get("maxHours")),
    maxPrice: int(p.get("maxPrice")),
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : d.sort,
  };
}

/** Serialise only what differs from the defaults. */
export function formToSearchParams(f: FormState, settings: Settings = DEFAULT_SETTINGS): string {
  const d = defaultForm(settings);
  const p = new URLSearchParams();

  p.set("from", f.origins.join(","));
  p.set("to", f.destinations.join(","));
  p.set("depart", f.departureDate);

  if (f.returnDate) p.set("return", f.returnDate);
  if (f.adults !== d.adults) p.set("adults", String(f.adults));
  if (f.children > 0) p.set("children", String(f.children));
  if (f.infants > 0) p.set("infants", String(f.infants));
  if (f.cabin !== d.cabin) p.set("cabin", f.cabin);
  if (f.currency !== d.currency) p.set("currency", f.currency);
  if (f.maxStops === null) p.set("maxStops", "any");
  else if (f.maxStops !== d.maxStops) p.set("maxStops", String(f.maxStops));
  if (f.flexDays !== d.flexDays) p.set("flex", String(f.flexDays));
  if (f.nearbyRadiusKm > 0) p.set("nearby", String(f.nearbyRadiusKm));
  if (f.maxPerPair !== d.maxPerPair) p.set("perRoute", String(f.maxPerPair));

  if (f.includeAirlines.length > 0) p.set("include", f.includeAirlines.join(","));
  if (f.excludeAirlines.length > 0) p.set("exclude", f.excludeAirlines.join(","));
  if (f.alliances.length > 0) p.set("alliances", f.alliances.join(","));
  if (f.fareBrands.length > 0) p.set("brands", f.fareBrands.join(","));
  if (f.requireCheckedBag) p.set("bag", "1");
  if (f.excludeLowCost) p.set("noLcc", "1");

  if (f.viaAirports.length > 0) p.set("via", f.viaAirports.join(","));
  if (f.avoidAirports.length > 0) p.set("avoid", f.avoidAirports.join(","));
  if (f.maxSegments !== null) p.set("maxSegments", String(f.maxSegments));
  if (f.avoidRedEye) p.set("noRedEye", "1");

  if (f.departAfter) p.set("departAfter", f.departAfter);
  if (f.departBefore) p.set("departBefore", f.departBefore);
  if (f.arriveAfter) p.set("arriveAfter", f.arriveAfter);
  if (f.arriveBefore) p.set("arriveBefore", f.arriveBefore);
  if (f.minLayoverMinutes !== null) p.set("minLayover", String(f.minLayoverMinutes));
  if (f.maxLayoverMinutes !== null) p.set("maxLayover", String(f.maxLayoverMinutes));

  if (f.maxDurationHours !== null) p.set("maxHours", String(f.maxDurationHours));
  if (f.maxPrice !== null) p.set("maxPrice", String(f.maxPrice));
  if (f.sort !== d.sort) p.set("sort", f.sort);

  return p.toString();
}

/** Convert the form into the payload the API expects. */
export function formToRequest(f: FormState, weights?: RankingWeights): SearchRequestInput {
  const req: SearchRequestInput = {
    origins: f.origins,
    destinations: f.destinations,
    departureDate: f.departureDate,
    adults: f.adults,
    children: f.children,
    infants: f.infants,
    cabin: f.cabin,
    currency: f.currency,
    flexDays: f.flexDays,
    nearbyRadiusKm: f.nearbyRadiusKm,
    maxPerPair: f.maxPerPair,
    includeAirlines: f.includeAirlines,
    excludeAirlines: f.excludeAirlines,
    alliances: f.alliances,
    fareBrands: f.fareBrands,
    requireCheckedBag: f.requireCheckedBag,
    excludeLowCost: f.excludeLowCost,
    viaAirports: f.viaAirports,
    avoidAirports: f.avoidAirports,
    avoidRedEye: f.avoidRedEye,
    sort: f.sort,
  };

  if (f.returnDate) req.returnDate = f.returnDate;
  if (f.maxStops !== null) req.maxStops = f.maxStops;
  if (f.maxSegments !== null) req.maxSegments = f.maxSegments;
  if (f.maxDurationHours !== null) req.maxDurationMinutes = f.maxDurationHours * 60;
  if (f.maxPrice !== null) req.maxPrice = f.maxPrice;
  if (f.minLayoverMinutes !== null) req.minLayoverMinutes = f.minLayoverMinutes;
  if (f.maxLayoverMinutes !== null) req.maxLayoverMinutes = f.maxLayoverMinutes;
  if (f.departAfter) req.departAfter = f.departAfter;
  if (f.departBefore) req.departBefore = f.departBefore;
  if (f.arriveAfter) req.arriveAfter = f.arriveAfter;
  if (f.arriveBefore) req.arriveBefore = f.arriveBefore;
  if (weights) req.rankingWeights = weights;

  return req;
}
