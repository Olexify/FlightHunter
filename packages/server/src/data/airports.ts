import { createRequire } from "node:module";
import type { Airport } from "@flighthunter/shared";
import { haversineKm } from "@flighthunter/shared";

/**
 * Worldwide airport directory (OpenFlights, ODbL). Shipped as a compact tuple
 * array and inflated once at startup — ~6k rows, so a scored linear scan is
 * comfortably sub-millisecond and needs no search dependency.
 */

type Row = [
  iata: string,
  name: string,
  city: string,
  country: string,
  lat: number,
  lon: number,
  tz: string,
  routes: number,
];

interface AirportFile {
  _license: string;
  _fields: string[];
  rows: Row[];
}

// `createRequire` keeps the JSON out of the TS build graph, so the shipped
// dataset is a plain runtime asset rather than something tsc has to re-emit.
const require = createRequire(import.meta.url);
const file = require("./airports.json") as AirportFile;

interface IndexedAirport extends Airport {
  /** Pre-lowercased haystacks so search never re-allocates per query. */
  _city: string;
  _name: string;
  _country: string;
}

const AIRPORTS: IndexedAirport[] = file.rows.map((r) => ({
  iata: r[0],
  name: r[1],
  city: r[2],
  country: r[3],
  lat: r[4],
  lon: r[5],
  tz: r[6],
  routes: r[7],
  _city: r[2].toLowerCase(),
  _name: r[1].toLowerCase(),
  _country: r[3].toLowerCase(),
}));

const BY_CODE = new Map<string, IndexedAirport>(AIRPORTS.map((a) => [a.iata, a]));

/**
 * IATA *metro* codes. These identify a city, not an airport, so they are absent
 * from the airport dataset — yet "NYC", "LON" and "TYO" are exactly what people
 * type. Mapping them to their member airports closes a real search dead end.
 */
const METRO_CODES: Record<string, string[]> = {
  NYC: ["JFK", "EWR", "LGA"],
  LON: ["LHR", "LGW", "STN", "LTN", "LCY"],
  PAR: ["CDG", "ORY", "BVA"],
  TYO: ["HND", "NRT"],
  OSA: ["KIX", "ITM"],
  MIL: ["MXP", "LIN", "BGY"],
  ROM: ["FCO", "CIA"],
  STO: ["ARN", "BMA", "NYO"],
  WAS: ["IAD", "DCA", "BWI"],
  CHI: ["ORD", "MDW"],
  MOW: ["SVO", "DME", "VKO"],
  BJS: ["PEK", "PKX"],
  SEL: ["ICN", "GMP"],
  SHA: ["PVG", "SHA"],
  SAO: ["GRU", "CGH", "VCP"],
  RIO: ["GIG", "SDU"],
  BUE: ["EZE", "AEP"],
  YTO: ["YYZ", "YTZ"],
  YMQ: ["YUL"],
  BKK: ["BKK", "DMK"],
  TSA: ["TPE", "TSA"],
  BER: ["BER"],
};

/** Airports behind a metro code, or empty when the code is not one. */
export function metroMembers(code: string): Airport[] {
  const members = METRO_CODES[code.toUpperCase()];
  if (!members) return [];
  return members
    .map((c) => BY_CODE.get(c))
    .filter((a): a is IndexedAirport => a !== undefined)
    .map(strip);
}

export function isMetroCode(code: string): boolean {
  return code.toUpperCase() in METRO_CODES;
}

const strip = ({ _city, _name, _country, ...rest }: IndexedAirport): Airport => rest;

export function airportCount(): number {
  return AIRPORTS.length;
}

export function datasetLicense(): string {
  return file._license;
}

export function getAirport(iata: string): Airport | undefined {
  const a = BY_CODE.get(iata.toUpperCase());
  return a ? strip(a) : undefined;
}

export function hasAirport(iata: string): boolean {
  return BY_CODE.has(iata.toUpperCase());
}

/**
 * Replace any metro code with its member airports, so a search for "NYC"
 * actually queries JFK, EWR and LGA instead of failing on an unknown code.
 */
export function expandMetroCodes(codes: string[]): { codes: string[]; expanded: string[] } {
  const out: string[] = [];
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const raw of codes) {
    const code = raw.toUpperCase();
    const members = METRO_CODES[code];

    if (members && !BY_CODE.has(code)) {
      for (const m of members) {
        if (BY_CODE.has(m) && !seen.has(m)) {
          seen.add(m);
          out.push(m);
          expanded.push(m);
        }
      }
      continue;
    }
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return { codes: out, expanded };
}

/** Split `["WAW","ZZZ"]` into the ones we know and the ones we do not. */
export function partitionKnown(codes: string[]): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of codes) {
    const up = c.toUpperCase();
    (BY_CODE.has(up) ? known : unknown).push(up);
  }
  return { known, unknown };
}

/**
 * Ranked autocomplete. Exact code beats code-prefix beats city-prefix beats
 * substring matches; ties break toward the bigger hub so "LON" surfaces
 * Heathrow before a regional strip with the same name.
 */
export function searchAirports(query: string, limit = 12): Airport[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return AIRPORTS.slice(0, limit).map(strip);
  }

  const scored: Array<{ a: IndexedAirport; score: number }> = [];

  // A metro code resolves to its member airports, biggest hub first.
  const metro = METRO_CODES[q.toUpperCase()];
  const metroRank = new Map<string, number>();
  if (metro) {
    metro.forEach((code, i) => metroRank.set(code, metro.length - i));
  }

  for (const a of AIRPORTS) {
    const code = a.iata.toLowerCase();
    let score = 0;

    const metroBoost = metroRank.get(a.iata);
    if (metroBoost !== undefined) {
      scored.push({ a, score: 1200 + metroBoost });
      continue;
    }

    if (code === q) score = 1000;
    else if (code.startsWith(q)) score = 900;
    else if (a._city === q) score = 780;
    else if (a._city.startsWith(q)) score = 700;
    else if (a._name.startsWith(q)) score = 600;
    else if (a._city.includes(q)) score = 450;
    else if (a._name.includes(q)) score = 350;
    else if (a._country.startsWith(q)) score = 200;
    else if (a._country.includes(q)) score = 120;
    else continue;

    // Hub size is weighted heavily enough to cross one match tier, because
    // typing "tok" should surface Tokyo Narita, not Tok Junction, Alaska —
    // which wins on an exact city name but has two scheduled routes. The cap
    // stays below the smallest two-tier gap so it can never skip two tiers,
    // and is high enough to keep separating the very largest hubs.
    const hubBonus = Math.min(160, Math.log10(a.routes + 1) * 50);
    // Airports with no scheduled service are almost never what was meant —
    // enough of a penalty that a dormant exact-code match ("WAR") still loses
    // to the obvious city ("WAW", Warsaw).
    const dormantPenalty = a.routes === 0 ? 200 : 0;

    scored.push({ a, score: score + hubBonus - dormantPenalty });
  }

  scored.sort((x, y) => y.score - x.score || x.a.iata.localeCompare(y.a.iata));
  return scored.slice(0, limit).map((s) => strip(s.a));
}

/**
 * Airports within `radiusKm` of `iata`, nearest first, excluding the origin.
 * Only airports with scheduled routes are returned — a nearby airstrip with no
 * commercial service would just waste a provider call.
 */
export function nearbyAirports(iata: string, radiusKm: number, limit = 5): Airport[] {
  const center = BY_CODE.get(iata.toUpperCase());
  if (!center || radiusKm <= 0) return [];

  const out: Array<{ a: IndexedAirport; d: number }> = [];
  for (const a of AIRPORTS) {
    if (a.iata === center.iata || a.routes === 0) continue;
    const d = haversineKm(center.lat, center.lon, a.lat, a.lon);
    if (d <= radiusKm) out.push({ a, d });
  }

  out.sort((x, y) => x.d - y.d);
  return out.slice(0, limit).map((s) => strip(s.a));
}

/** Straight-line distance between two airports, or null if either is unknown. */
export function distanceBetween(from: string, to: string): number | null {
  const a = BY_CODE.get(from.toUpperCase());
  const b = BY_CODE.get(to.toUpperCase());
  if (!a || !b) return null;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}
