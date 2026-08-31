import type { CabinClass, SearchRequestInput, SortKey } from "@flighthunter/shared";
import { todayPlus } from "@flighthunter/shared";

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
  includeAirlines: string[];
  excludeAirlines: string[];
  departAfter: string;
  departBefore: string;
  maxDurationHours: number | null;
  maxPrice: number | null;
  sort: SortKey;
}

export function defaultForm(): FormState {
  return {
    origins: ["WAW", "IST", "BUD", "PRG", "VIE"],
    destinations: ["NRT", "HND", "KIX"],
    // Local date, not UTC — `toISOString()` shifted this a day for anyone
    // east of Greenwich in the evening.
    departureDate: todayPlus(45),
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "ECONOMY",
    currency: "EUR",
    maxStops: 2,
    flexDays: 0,
    nearbyRadiusKm: 0,
    includeAirlines: [],
    excludeAirlines: [],
    departAfter: "",
    departBefore: "",
    maxDurationHours: null,
    maxPrice: null,
    sort: "best",
  };
}

const CABINS: CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
const SORTS: SortKey[] = ["best", "price", "duration", "stops", "departure", "arrival"];

const list = (v: string | null): string[] =>
  v ? v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];

const int = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Rebuild the form from a query string, falling back to defaults per field. */
export function formFromSearchParams(search: string): FormState {
  const p = new URLSearchParams(search);
  const d = defaultForm();
  if ([...p.keys()].length === 0) return d;

  const cabin = p.get("cabin");
  const sort = p.get("sort");
  const stops = int(p.get("maxStops"));

  return {
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
    flexDays: int(p.get("flex")) ?? 0,
    nearbyRadiusKm: int(p.get("nearby")) ?? 0,
    includeAirlines: list(p.get("include")),
    excludeAirlines: list(p.get("exclude")),
    departAfter: p.get("departAfter") ?? "",
    departBefore: p.get("departBefore") ?? "",
    maxDurationHours: int(p.get("maxHours")),
    maxPrice: int(p.get("maxPrice")),
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : d.sort,
  };
}

/** Serialise only what differs from the defaults. */
export function formToSearchParams(f: FormState): string {
  const d = defaultForm();
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
  if (f.flexDays > 0) p.set("flex", String(f.flexDays));
  if (f.nearbyRadiusKm > 0) p.set("nearby", String(f.nearbyRadiusKm));
  if (f.includeAirlines.length > 0) p.set("include", f.includeAirlines.join(","));
  if (f.excludeAirlines.length > 0) p.set("exclude", f.excludeAirlines.join(","));
  if (f.departAfter) p.set("departAfter", f.departAfter);
  if (f.departBefore) p.set("departBefore", f.departBefore);
  if (f.maxDurationHours !== null) p.set("maxHours", String(f.maxDurationHours));
  if (f.maxPrice !== null) p.set("maxPrice", String(f.maxPrice));
  if (f.sort !== d.sort) p.set("sort", f.sort);

  return p.toString();
}

/** Convert the form into the payload the API expects. */
export function formToRequest(f: FormState): SearchRequestInput {
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
    includeAirlines: f.includeAirlines,
    excludeAirlines: f.excludeAirlines,
    sort: f.sort,
  };

  if (f.returnDate) req.returnDate = f.returnDate;
  if (f.maxStops !== null) req.maxStops = f.maxStops;
  if (f.maxDurationHours !== null) req.maxDurationMinutes = f.maxDurationHours * 60;
  if (f.maxPrice !== null) req.maxPrice = f.maxPrice;
  if (f.departAfter) req.departAfter = f.departAfter;
  if (f.departBefore) req.departBefore = f.departBefore;

  return req;
}
