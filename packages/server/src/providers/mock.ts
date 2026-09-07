import type {
  Airline,
  Baggage,
  FareBrand,
  FlightOffer,
  Itinerary,
  Segment,
  SearchRequest,
} from "@flighthunter/shared";
import {
  addDays,
  airlineName,
  daysBetween,
  estimateCo2Kg,
  estimateFlightMinutes,
  haversineKm,
  isLowCost,
} from "@flighthunter/shared";
import { distanceBetween, getAirport } from "../data/airports.js";
import { wallClockInZone, zonedWallClockToEpoch } from "../util/time.js";
import type { FlightProvider, ProviderContext, RoutePair } from "./types.js";

/**
 * Offline provider used when no API keys are present.
 *
 * Deterministic: the same route and date always produce the same fares, so the
 * UI, the price grid and the saved price history stay coherent across reloads.
 * Prices model real drivers — distance, cabin, connections, how far out the
 * departure is, and the fare family — so the app is genuinely usable before
 * anyone signs up for an API key.
 */

/* ------------------------------ deterministic RNG ------------------------------ */

function hash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough distribution for fixture data. */
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)] ?? (items[0] as T);

/* --------------------------------- carriers --------------------------------- */

/** Codes resolve to real names and alliances via the shared airline table. */
interface MockCarrier {
  code: string;
  hub: string;
  /** Fare multiplier reflecting the carrier's market position. */
  premium: number;
}

const CARRIERS: readonly MockCarrier[] = [
  { code: "TK", hub: "IST", premium: 1.0 },
  { code: "QR", hub: "DOH", premium: 1.15 },
  { code: "EK", hub: "DXB", premium: 1.18 },
  { code: "EY", hub: "AUH", premium: 1.1 },
  { code: "AY", hub: "HEL", premium: 1.08 },
  { code: "LH", hub: "FRA", premium: 1.2 },
  { code: "LX", hub: "ZRH", premium: 1.21 },
  { code: "KL", hub: "AMS", premium: 1.14 },
  { code: "AF", hub: "CDG", premium: 1.16 },
  { code: "LO", hub: "WAW", premium: 0.95 },
  { code: "OS", hub: "VIE", premium: 1.12 },
  { code: "SU", hub: "SVO", premium: 0.85 },
  { code: "CA", hub: "PEK", premium: 0.88 },
  { code: "CZ", hub: "CAN", premium: 0.84 },
  { code: "MU", hub: "PVG", premium: 0.83 },
  { code: "KE", hub: "ICN", premium: 1.05 },
  { code: "OZ", hub: "ICN", premium: 1.02 },
  { code: "SQ", hub: "SIN", premium: 1.22 },
  { code: "TG", hub: "BKK", premium: 1.03 },
  { code: "BA", hub: "LHR", premium: 1.17 },
  { code: "IB", hub: "MAD", premium: 1.09 },
  { code: "JL", hub: "HND", premium: 1.19 },
  { code: "NH", hub: "HND", premium: 1.19 },
  { code: "CX", hub: "HKG", premium: 1.13 },
  { code: "AZ", hub: "FCO", premium: 1.07 },
  { code: "TP", hub: "LIS", premium: 0.98 },
  { code: "A3", hub: "ATH", premium: 0.97 },
  { code: "UA", hub: "ORD", premium: 1.11 },
  { code: "DL", hub: "ATL", premium: 1.12 },
  { code: "AA", hub: "DFW", premium: 1.1 },
  { code: "AC", hub: "YYZ", premium: 1.08 },
  { code: "AI", hub: "DEL", premium: 0.9 },
  { code: "PC", hub: "SAW", premium: 0.72 },
  { code: "W6", hub: "BUD", premium: 0.68 },
  { code: "FR", hub: "STN", premium: 0.65 },
  { code: "U2", hub: "LGW", premium: 0.7 },
  { code: "VY", hub: "BCN", premium: 0.71 },
  { code: "DY", hub: "OSL", premium: 0.74 },
  { code: "EW", hub: "DUS", premium: 0.76 },
  { code: "D8", hub: "OSL", premium: 0.7 },
];

const AIRCRAFT = [
  "Boeing 787-9",
  "Airbus A350-900",
  "Boeing 777-300ER",
  "Airbus A330-300",
  "Airbus A321neo",
  "Boeing 737 MAX 8",
  "Airbus A320neo",
  "Boeing 787-8",
];

const CABIN_MULTIPLIER: Record<string, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.9,
  BUSINESS: 3.6,
  FIRST: 6.2,
};

/* ------------------------------- fare families ------------------------------ */

interface BrandSpec {
  brand: FareBrand;
  multiplier: number;
  baggage: Baggage;
  refundable: boolean;
  changeable: boolean;
}

/**
 * Most of a route's real price spread comes from fare families rather than
 * from different flights, so each flight is offered at up to three prices.
 */
function brandsFor(lowCost: boolean): BrandSpec[] {
  if (lowCost) {
    return [
      {
        brand: "BASIC",
        multiplier: 1,
        baggage: { carryOnIncluded: false, checkedBags: 0 },
        refundable: false,
        changeable: false,
      },
      {
        brand: "STANDARD",
        multiplier: 1.34,
        baggage: { carryOnIncluded: true, checkedBags: 1, checkedKg: 20 },
        refundable: false,
        changeable: true,
      },
      {
        brand: "FLEX",
        multiplier: 1.78,
        baggage: { carryOnIncluded: true, checkedBags: 2, checkedKg: 20 },
        refundable: true,
        changeable: true,
      },
    ];
  }
  return [
    {
      brand: "BASIC",
      multiplier: 1,
      baggage: { carryOnIncluded: true, checkedBags: 0 },
      refundable: false,
      changeable: false,
    },
    {
      brand: "STANDARD",
      multiplier: 1.19,
      baggage: { carryOnIncluded: true, checkedBags: 1, checkedKg: 23 },
      refundable: false,
      changeable: true,
    },
    {
      brand: "FLEX",
      multiplier: 1.57,
      baggage: { carryOnIncluded: true, checkedBags: 2, checkedKg: 23 },
      refundable: true,
      changeable: true,
    },
  ];
}

/* ---------------------------------- pricing ---------------------------------- */

/**
 * Fares are cheapest roughly two months out, climb steeply inside three weeks,
 * and carry a mild premium for very distant bookings.
 */
function advancePurchaseFactor(daysUntilDeparture: number): number {
  if (daysUntilDeparture <= 3) return 2.15;
  if (daysUntilDeparture <= 7) return 1.75;
  if (daysUntilDeparture <= 14) return 1.42;
  if (daysUntilDeparture <= 21) return 1.22;
  if (daysUntilDeparture <= 45) return 1.05;
  if (daysUntilDeparture <= 90) return 1.0;
  if (daysUntilDeparture <= 180) return 1.06;
  return 1.12;
}

/** Friday/Sunday departures cost more; midweek is the bargain. */
function dayOfWeekFactor(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const table = [1.06, 0.96, 0.94, 0.95, 1.0, 1.09, 1.05]; // Sun..Sat
  return table[dow] ?? 1;
}

/** Rough per-km rate: long-haul is far cheaper per kilometre than short-haul. */
function ratePerKm(distanceKm: number): number {
  if (distanceKm < 800) return 0.19;
  if (distanceKm < 2500) return 0.11;
  if (distanceKm < 6000) return 0.075;
  return 0.058;
}

/* ------------------------------ itinerary building ----------------------------- */

/** Choose a connecting hub that lies roughly on the way, not a wild detour. */
function chooseHub(
  origin: string,
  destination: string,
  carrierHub: string,
  rand: () => number,
): string | null {
  const direct = distanceBetween(origin, destination);

  // A connection through the origin or the destination is not a connection.
  const usable = (hub: string): boolean => hub !== origin && hub !== destination;

  if (usable(carrierHub)) {
    const toHub = distanceBetween(origin, carrierHub);
    const fromHub = distanceBetween(carrierHub, destination);
    // Accept the carrier's own hub when the detour is under ~45%.
    if (direct !== null && toHub !== null && fromHub !== null && toHub + fromHub < direct * 1.45) {
      return carrierHub;
    }
  }

  const alternatives = [
    "IST", "DXB", "DOH", "FRA", "AMS", "HEL", "ICN", "PEK", "SIN", "CDG", "LHR", "ZRH", "VIE", "MUC",
  ].filter(usable);

  if (direct === null) return null;

  // Every candidate must be a detour a real airline would actually fly. The
  // previous version picked a random alternative 30% of the time with NO
  // distance check at all, which produced Warsaw->Vienna (557 km) routed via
  // Beijing: 14,396 km and 23 hours. A quarter of all short-haul offers were
  // nonsense like that.
  const MAX_DETOUR_RATIO = 1.6;

  const viable: Array<{ hub: string; detour: number }> = [];
  for (const h of alternatives) {
    const a = distanceBetween(origin, h);
    const b = distanceBetween(h, destination);
    if (a === null || b === null) continue;
    const detour = a + b;
    if (detour <= direct * MAX_DETOUR_RATIO) viable.push({ hub: h, detour });
  }

  if (viable.length === 0) return null; // nothing sensible — fly it nonstop

  viable.sort((x, y) => x.detour - y.detour);

  // Some variety so every mock connection is not the same airport, but only
  // ever among hubs that are genuinely on the way.
  if (viable.length > 1 && rand() < 0.3) {
    return pick(rand, viable.slice(0, 3)).hub;
  }
  return viable[0]?.hub ?? null;
}

function buildSegment(
  from: string,
  to: string,
  departEpoch: number,
  carrier: MockCarrier,
  name: string,
  rand: () => number,
): { segment: Segment; arriveEpoch: number; distanceKm: number } {
  const a = getAirport(from);
  const b = getAirport(to);
  const distance = a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : 1000;
  const minutes = Math.max(45, estimateFlightMinutes(distance) + Math.floor(rand() * 25) - 10);
  const arriveEpoch = departEpoch + minutes * 60_000;

  return {
    segment: {
      from,
      to,
      departureAt: wallClockInZone(departEpoch, a?.tz ?? "UTC"),
      arrivalAt: wallClockInZone(arriveEpoch, b?.tz ?? "UTC"),
      carrierCode: carrier.code,
      carrierName: name,
      flightNumber: String(100 + Math.floor(rand() * 899)),
      aircraft: pick(rand, AIRCRAFT),
      durationMinutes: minutes,
    },
    arriveEpoch,
    distanceKm: distance,
  };
}

interface BuiltItinerary {
  itinerary: Itinerary;
  distanceKm: number;
}

function buildItinerary(
  direction: "outbound" | "inbound",
  origin: string,
  destination: string,
  date: string,
  stops: number,
  carrier: MockCarrier,
  name: string,
  departHour: number,
  rand: () => number,
): BuiltItinerary | null {
  const originAirport = getAirport(origin);
  if (!originAirport) return null;

  const departMinute = pick(rand, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  const startWall = `${date}T${String(departHour).padStart(2, "0")}:${String(departMinute).padStart(2, "0")}:00`;

  let cursor = zonedWallClockToEpoch(startWall, originAirport.tz);
  if (!Number.isFinite(cursor)) return null;

  const waypoints: string[] = [origin];
  if (stops >= 1) {
    const hub = chooseHub(origin, destination, carrier.hub, rand);
    if (hub) waypoints.push(hub);
  }
  if (stops >= 2) {
    const second = chooseHub(waypoints[waypoints.length - 1] ?? origin, destination, carrier.hub, rand);
    if (second && !waypoints.includes(second)) waypoints.push(second);
  }
  waypoints.push(destination);

  const segments: Segment[] = [];
  let distanceKm = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (!from || !to) continue;

    const built = buildSegment(from, to, cursor, carrier, name, rand);
    cursor = built.arriveEpoch;
    distanceKm += built.distanceKm;

    if (i < waypoints.length - 2) {
      const layover = 55 + Math.floor(rand() * 240);
      built.segment.layoverMinutes = layover;
      cursor += layover * 60_000;
    }
    segments.push(built.segment);
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;

  const flightMinutes = segments.reduce((s, seg) => s + seg.durationMinutes, 0);
  const layoverMinutes = segments.reduce((s, seg) => s + (seg.layoverMinutes ?? 0), 0);

  return {
    distanceKm,
    itinerary: {
      direction,
      departureAt: first.departureAt,
      arrivalAt: last.arrivalAt,
      durationMinutes: flightMinutes + layoverMinutes,
      stops: segments.length - 1,
      segments,
    },
  };
}

/* --------------------------------- provider --------------------------------- */

/** Distinct departure hours so a route returns a full day of options. */
const DEPARTURE_HOURS = [1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

export class MockProvider implements FlightProvider {
  readonly id = "mock" as const;
  readonly label = "Offline sample data";

  /** Always available — that is the entire point of this provider. */
  isConfigured(): boolean {
    return true;
  }

  async search(pair: RoutePair, req: SearchRequest, _ctx: ProviderContext): Promise<FlightOffer[]> {
    const distance = distanceBetween(pair.origin, pair.destination);
    if (distance === null) return [];

    const daysOut = Math.max(0, daysBetween(new Date().toISOString().slice(0, 10), pair.departureDate));
    const cabinMultiplier = CABIN_MULTIPLIER[req.cabin] ?? 1;
    const passengers = req.adults + req.children * 0.75 + req.infants * 0.1;

    // Build distinct flights first, then price each one across its fare
    // families. Three brands per flight is where the price depth comes from.
    const wantedOffers = Math.min(req.maxPerPair, 120);
    const products = Math.max(1, Math.ceil(wantedOffers / 3));

    const offers: FlightOffer[] = [];
    const fetchedAt = new Date().toISOString();

    for (let i = 0; i < products && offers.length < wantedOffers; i++) {
      const rand = rng(
        `${pair.origin}|${pair.destination}|${pair.departureDate}|${pair.returnDate ?? ""}|${req.cabin}|${i}`,
      );
      const carrier = pick(rand, CARRIERS);
      const name = airlineName(carrier.code);
      const lowCost = isLowCost(carrier.code);

      // Low-cost carriers do not fly ultra-long-haul.
      if (lowCost && distance > 6500) continue;

      const canFlyDirect = distance < 12000;
      const roll = rand();
      const stops = !canFlyDirect ? (roll < 0.6 ? 1 : 2) : roll < 0.24 ? 0 : roll < 0.8 ? 1 : 2;

      // Spread departures across the clock rather than clustering mid-morning.
      const departHour = DEPARTURE_HOURS[i % DEPARTURE_HOURS.length] ?? 9;

      const outbound = buildItinerary(
        "outbound",
        pair.origin,
        pair.destination,
        pair.departureDate,
        stops,
        carrier,
        name,
        departHour,
        rand,
      );
      if (!outbound) continue;

      const itineraries: Itinerary[] = [outbound.itinerary];
      let distanceFlown = outbound.distanceKm;

      if (pair.returnDate) {
        const inbound = buildItinerary(
          "inbound",
          pair.destination,
          pair.origin,
          pair.returnDate,
          stops === 0 ? (rand() < 0.7 ? 0 : 1) : stops,
          carrier,
          name,
          DEPARTURE_HOURS[(i + 5) % DEPARTURE_HOURS.length] ?? 14,
          rand,
        );
        if (inbound) {
          itineraries.push(inbound.itinerary);
          distanceFlown += inbound.distanceKm;
        }
      }

      const legs = itineraries.length;
      const base = distance * ratePerKm(distance) * legs;
      // Price the trip that was actually built. `stops` is only the intent —
      // when no sensible connecting hub exists the itinerary comes back
      // nonstop, and charging it the 2-stop discount would misprice it.
      const actualStops = Math.max(...itineraries.map((it) => it.stops));
      const stopDiscount = actualStops === 0 ? 1.18 : actualStops === 1 ? 1.0 : 0.87;
      const variance = 0.82 + rand() * 0.45;

      const baseFare =
        base *
        stopDiscount *
        carrier.premium *
        cabinMultiplier *
        advancePurchaseFactor(daysOut) *
        dayOfWeekFactor(pair.departureDate) *
        variance *
        Math.max(1, passengers);

      const airlines: Airline[] = [{ code: carrier.code, name }];
      const co2Kg = estimateCo2Kg(distanceFlown, req.cabin);

      for (const spec of brandsFor(lowCost)) {
        if (offers.length >= wantedOffers) break;

        offers.push({
          id: `mock:${pair.origin}-${pair.destination}:${pair.departureDate}:${i}:${spec.brand}`,
          provider: "mock",
          origin: pair.origin,
          destination: pair.destination,
          price: { total: Math.round(baseFare * spec.multiplier), currency: req.currency },
          itineraries,
          airlines,
          totalDurationMinutes: itineraries.reduce((s, it) => s + it.durationMinutes, 0),
          maxStops: Math.max(...itineraries.map((it) => it.stops)),
          cabin: req.cabin,
          fareBrand: spec.brand,
          baggage: spec.baggage,
          refundable: spec.refundable,
          changeable: spec.changeable,
          co2Kg,
          distanceKm: Math.round(distanceFlown),
          seatsRemaining: 1 + Math.floor(rand() * 8),
          fetchedAt,
          warnings: ["Sample data — add API keys in .env for live fares"],
        });
      }
    }

    return offers;
  }
}

/** Dates the mock grid should look plausible over, used by tests. */
export function mockDateWindow(date: string, spread: number): string[] {
  const out: string[] = [];
  for (let d = -spread; d <= spread; d++) out.push(addDays(date, d));
  return out;
}
