import type { Airline, FlightOffer, Itinerary, Segment, SearchRequest } from "@flighthunter/shared";
import { addDays, daysBetween, haversineKm, estimateFlightMinutes } from "@flighthunter/shared";
import { getAirport, distanceBetween } from "../data/airports.js";
import { wallClockInZone, zonedWallClockToEpoch } from "../util/time.js";
import type { FlightProvider, ProviderContext, RoutePair } from "./types.js";

/**
 * Offline provider used when no API keys are present.
 *
 * It is deterministic: the same route and date always produce the same fares,
 * so the UI, the price grid and the saved-price history stay coherent across
 * reloads. Prices are modelled on real drivers — great-circle distance, cabin,
 * connection count and how far out the departure is — so the app is genuinely
 * usable (and demo-able) before anyone signs up for an API key.
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

const CARRIERS: ReadonlyArray<Airline & { hub: string; premium: number }> = [
  { code: "TK", name: "Turkish Airlines", hub: "IST", premium: 1.0 },
  { code: "QR", name: "Qatar Airways", hub: "DOH", premium: 1.15 },
  { code: "EK", name: "Emirates", hub: "DXB", premium: 1.18 },
  { code: "EY", name: "Etihad Airways", hub: "AUH", premium: 1.1 },
  { code: "AY", name: "Finnair", hub: "HEL", premium: 1.08 },
  { code: "LH", name: "Lufthansa", hub: "FRA", premium: 1.2 },
  { code: "KL", name: "KLM", hub: "AMS", premium: 1.14 },
  { code: "AF", name: "Air France", hub: "CDG", premium: 1.16 },
  { code: "LO", name: "LOT Polish Airlines", hub: "WAW", premium: 0.95 },
  { code: "OS", name: "Austrian Airlines", hub: "VIE", premium: 1.12 },
  { code: "SU", name: "Aeroflot", hub: "SVO", premium: 0.85 },
  { code: "CA", name: "Air China", hub: "PEK", premium: 0.88 },
  { code: "CZ", name: "China Southern", hub: "CAN", premium: 0.84 },
  { code: "KE", name: "Korean Air", hub: "ICN", premium: 1.05 },
  { code: "SQ", name: "Singapore Airlines", hub: "SIN", premium: 1.22 },
  { code: "BA", name: "British Airways", hub: "LHR", premium: 1.17 },
  { code: "JL", name: "Japan Airlines", hub: "HND", premium: 1.19 },
  { code: "NH", name: "ANA", hub: "HND", premium: 1.19 },
];

const AIRCRAFT = ["Boeing 787-9", "Airbus A350-900", "Boeing 777-300ER", "Airbus A330-300", "Airbus A321neo"];

const CABIN_MULTIPLIER: Record<string, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.9,
  BUSINESS: 3.6,
  FIRST: 6.2,
};

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
  // Without this guard, LOT (hub WAW) produced "WAW → KIX via WAW" with a
  // zero-length first segment, because a via-hub distance of 0 + direct
  // always beat the detour threshold.
  const usable = (hub: string): boolean => hub !== origin && hub !== destination;

  if (usable(carrierHub)) {
    const toHub = distanceBetween(origin, carrierHub);
    const fromHub = distanceBetween(carrierHub, destination);
    // Accept the carrier's own hub when the detour is under ~45%.
    if (direct !== null && toHub !== null && fromHub !== null && toHub + fromHub < direct * 1.45) {
      return carrierHub;
    }
  }

  const alternatives = ["IST", "DXB", "DOH", "FRA", "AMS", "HEL", "ICN", "PEK", "SIN", "CDG"].filter(
    usable,
  );

  let best: string | null = null;
  let bestDetour = Infinity;
  for (const h of alternatives) {
    const a = distanceBetween(origin, h);
    const b = distanceBetween(h, destination);
    if (a === null || b === null) continue;
    const detour = a + b;
    if (detour < bestDetour) {
      bestDetour = detour;
      best = h;
    }
  }

  // A little randomness so every mock 1-stop is not the same airport.
  if (best && alternatives.length > 0 && rand() < 0.25) return pick(rand, alternatives);
  return best;
}

function buildSegment(
  from: string,
  to: string,
  departEpoch: number,
  carrier: Airline,
  rand: () => number,
): { segment: Segment; arriveEpoch: number } {
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
      carrierName: carrier.name,
      flightNumber: String(100 + Math.floor(rand() * 899)),
      aircraft: pick(rand, AIRCRAFT),
      durationMinutes: minutes,
    },
    arriveEpoch,
  };
}

function buildItinerary(
  direction: "outbound" | "inbound",
  origin: string,
  destination: string,
  date: string,
  stops: number,
  carrier: Airline & { hub: string },
  rand: () => number,
): Itinerary | null {
  const originAirport = getAirport(origin);
  if (!originAirport) return null;

  const departHour = 6 + Math.floor(rand() * 15);
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
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (!from || !to) continue;

    const built = buildSegment(from, to, cursor, carrier, rand);
    cursor = built.arriveEpoch;

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
    direction,
    departureAt: first.departureAt,
    arrivalAt: last.arrivalAt,
    durationMinutes: flightMinutes + layoverMinutes,
    stops: segments.length - 1,
    segments,
  };
}

/* --------------------------------- provider --------------------------------- */

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

    const count = Math.min(req.maxPerPair, 8);
    const offers: FlightOffer[] = [];
    const fetchedAt = new Date().toISOString();

    for (let i = 0; i < count; i++) {
      const rand = rng(`${pair.origin}|${pair.destination}|${pair.departureDate}|${pair.returnDate ?? ""}|${req.cabin}|${i}`);
      const carrier = pick(rand, CARRIERS);

      // Direct service only exists on routes an airline could plausibly fly nonstop.
      const canFlyDirect = distance < 12000;
      const roll = rand();
      const stops = !canFlyDirect ? (roll < 0.6 ? 1 : 2) : roll < 0.22 ? 0 : roll < 0.78 ? 1 : 2;

      const outbound = buildItinerary(
        "outbound",
        pair.origin,
        pair.destination,
        pair.departureDate,
        stops,
        carrier,
        rand,
      );
      if (!outbound) continue;

      const itineraries: Itinerary[] = [outbound];
      if (pair.returnDate) {
        const inbound = buildItinerary(
          "inbound",
          pair.destination,
          pair.origin,
          pair.returnDate,
          stops === 0 ? (rand() < 0.7 ? 0 : 1) : stops,
          carrier,
          rand,
        );
        if (inbound) itineraries.push(inbound);
      }

      const legs = itineraries.length;
      const base = distance * ratePerKm(distance) * legs;
      const stopDiscount = stops === 0 ? 1.18 : stops === 1 ? 1.0 : 0.87;
      const variance = 0.82 + rand() * 0.45;

      const total =
        base *
        stopDiscount *
        carrier.premium *
        cabinMultiplier *
        advancePurchaseFactor(daysOut) *
        dayOfWeekFactor(pair.departureDate) *
        variance *
        Math.max(1, passengers);

      const airlines: Airline[] = [{ code: carrier.code, name: carrier.name }];

      offers.push({
        id: `mock:${pair.origin}-${pair.destination}:${pair.departureDate}:${i}`,
        provider: "mock",
        origin: pair.origin,
        destination: pair.destination,
        price: { total: Math.round(total), currency: req.currency },
        itineraries,
        airlines,
        totalDurationMinutes: itineraries.reduce((s, it) => s + it.durationMinutes, 0),
        maxStops: Math.max(...itineraries.map((it) => it.stops)),
        cabin: req.cabin,
        seatsRemaining: 1 + Math.floor(rand() * 8),
        fetchedAt,
        warnings: ["Sample data — add API keys in .env for live fares"],
      });
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
