import type { FlightOffer, SearchRequest } from "@flighthunter/shared";
import { allianceOf, isLowCost, localTimeToMinutes, minutesIntoDay } from "@flighthunter/shared";

/**
 * Post-normalisation filtering. Providers accept only a subset of these
 * constraints, so every filter is re-applied locally — that way the result set
 * obeys the request regardless of which source produced each offer.
 */

export interface FilterReason {
  offerId: string;
  reason: string;
}

function layoverRange(offer: FlightOffer): { min: number; max: number } | null {
  let min = Infinity;
  let max = 0;
  let found = false;
  for (const it of offer.itineraries) {
    for (const seg of it.segments) {
      if (seg.layoverMinutes === undefined) continue;
      found = true;
      min = Math.min(min, seg.layoverMinutes);
      max = Math.max(max, seg.layoverMinutes);
    }
  }
  return found ? { min, max } : null;
}

/** Time-of-day windows apply to the OUTBOUND leg, which is what users mean. */
function outbound(offer: FlightOffer) {
  return offer.itineraries.find((i) => i.direction === "outbound") ?? offer.itineraries[0];
}

/** Every airport touched as a CONNECTION, excluding true origins and finals. */
function connectionAirports(offer: FlightOffer): string[] {
  const out: string[] = [];
  for (const it of offer.itineraries) {
    for (const seg of it.segments.slice(0, -1)) out.push(seg.to);
  }
  return out;
}

/** Departures in the small hours, which many travellers want to avoid. */
function isRedEye(departureAt: string): boolean {
  const minutes = minutesIntoDay(departureAt);
  if (minutes === null) return false;
  return minutes >= 60 && minutes < 300; // 01:00–04:59
}

function withinWindow(
  minutes: number | null,
  after: string | undefined,
  before: string | undefined,
): boolean {
  if (minutes === null) return true;
  if (after) {
    const a = localTimeToMinutes(after);
    if (a !== null && minutes < a) return false;
  }
  if (before) {
    const b = localTimeToMinutes(before);
    if (b !== null && minutes > b) return false;
  }
  return true;
}

/** Returns the offers that survive, plus why each rejection happened. */
export function applyFilters(
  offers: FlightOffer[],
  req: SearchRequest,
): { kept: FlightOffer[]; rejected: FilterReason[] } {
  const kept: FlightOffer[] = [];
  const rejected: FilterReason[] = [];

  const include = new Set(req.includeAirlines);
  const exclude = new Set(req.excludeAirlines);

  for (const offer of offers) {
    // `maxStops` compares against the WORST leg. A nonstop outbound paired
    // with a two-stop return is a two-stop trip for filtering purposes.
    if (req.maxStops !== undefined && offer.maxStops > req.maxStops) {
      rejected.push({ offerId: offer.id, reason: `${offer.maxStops} stops` });
      continue;
    }
    if (req.maxDurationMinutes !== undefined && offer.totalDurationMinutes > req.maxDurationMinutes) {
      rejected.push({ offerId: offer.id, reason: "too long" });
      continue;
    }
    if (req.maxPrice !== undefined && offer.price.total > req.maxPrice) {
      rejected.push({ offerId: offer.id, reason: "over budget" });
      continue;
    }

    const codes = offer.airlines.map((a) => a.code.toUpperCase());
    if (include.size > 0 && !codes.some((c) => include.has(c))) {
      rejected.push({ offerId: offer.id, reason: "airline not in include list" });
      continue;
    }
    if (exclude.size > 0 && codes.some((c) => exclude.has(c))) {
      rejected.push({ offerId: offer.id, reason: "excluded airline" });
      continue;
    }
    if (req.alliances.length > 0 && !codes.some((c) => req.alliances.includes(allianceOf(c)))) {
      rejected.push({ offerId: offer.id, reason: "outside selected alliances" });
      continue;
    }
    if (req.excludeLowCost && codes.some((c) => isLowCost(c))) {
      rejected.push({ offerId: offer.id, reason: "low-cost carrier" });
      continue;
    }

    if (req.fareBrands.length > 0 && (!offer.fareBrand || !req.fareBrands.includes(offer.fareBrand))) {
      rejected.push({ offerId: offer.id, reason: "fare family not selected" });
      continue;
    }
    // Only enforce a checked bag when the provider actually told us about
    // baggage; otherwise this would silently drop every Amadeus result.
    if (req.requireCheckedBag && offer.baggage && offer.baggage.checkedBags < 1) {
      rejected.push({ offerId: offer.id, reason: "no checked bag included" });
      continue;
    }

    const connections = connectionAirports(offer);
    if (req.avoidAirports.length > 0 && connections.some((c) => req.avoidAirports.includes(c))) {
      rejected.push({ offerId: offer.id, reason: "routes through an avoided airport" });
      continue;
    }
    if (req.viaAirports.length > 0 && !connections.some((c) => req.viaAirports.includes(c))) {
      rejected.push({ offerId: offer.id, reason: "does not route via a required airport" });
      continue;
    }
    if (
      req.maxSegments !== undefined &&
      offer.itineraries.some((it) => it.segments.length > (req.maxSegments as number))
    ) {
      rejected.push({ offerId: offer.id, reason: "too many flights" });
      continue;
    }
    if (req.avoidRedEye && offer.itineraries.some((it) => isRedEye(it.departureAt))) {
      rejected.push({ offerId: offer.id, reason: "red-eye departure" });
      continue;
    }

    const layovers = layoverRange(offer);
    if (layovers) {
      if (req.minLayoverMinutes !== undefined && layovers.min < req.minLayoverMinutes) {
        rejected.push({ offerId: offer.id, reason: "layover too short" });
        continue;
      }
      if (req.maxLayoverMinutes !== undefined && layovers.max > req.maxLayoverMinutes) {
        rejected.push({ offerId: offer.id, reason: "layover too long" });
        continue;
      }
    }

    const out = outbound(offer);
    if (out) {
      if (!withinWindow(minutesIntoDay(out.departureAt), req.departAfter, req.departBefore)) {
        rejected.push({ offerId: offer.id, reason: "departure outside window" });
        continue;
      }
      if (!withinWindow(minutesIntoDay(out.arrivalAt), req.arriveAfter, req.arriveBefore)) {
        rejected.push({ offerId: offer.id, reason: "arrival outside window" });
        continue;
      }
    }

    kept.push(offer);
  }

  return { kept, rejected };
}
