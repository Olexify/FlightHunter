import type { FlightOffer, SearchRequest } from "@flighthunter/shared";
import { localTimeToMinutes, minutesIntoDay } from "@flighthunter/shared";

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
