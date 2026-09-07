import type { Airport, ExploreRequest, ExploreResponse, ExploreResult } from "@flighthunter/shared";
import { addDays, regionOf, SearchRequest } from "@flighthunter/shared";
import { logger } from "../logger.js";
import { distanceBetween, getAirport, searchAirports } from "../data/airports.js";
import { runSearch } from "./orchestrator.js";

/**
 * "Where can I go for X?" — the inverse of a normal search.
 *
 * Rather than reimplementing orchestration, this picks candidate destinations
 * and hands them to `runSearch` in chunks, so provider selection, caching, the
 * call budget, filtering and ranking all behave identically to a normal search.
 */

/** SearchRequest caps destinations per call; explore batches around that. */
const DESTINATIONS_PER_CALL = 30;

/** Rough cruise speed used to turn a flight-time ceiling into a distance one. */
const CRUISE_KMH = 840;

/**
 * Candidate destinations, biggest hubs first.
 *
 * The dataset is pre-sorted by route count, so an empty query returns the
 * world's busiest airports — exactly the places worth exploring. Pulling a
 * wider pool than requested leaves room for the region and distance filters
 * to reject without starving the result set.
 */
function pickCandidates(req: ExploreRequest, origins: string[]): Airport[] {
  const pool = searchAirports("", Math.min(600, req.candidates * 8));
  const originSet = new Set(origins);
  const out: Airport[] = [];

  const maxKm = req.maxFlightHours !== undefined ? req.maxFlightHours * CRUISE_KMH : Infinity;

  for (const airport of pool) {
    if (out.length >= req.candidates) break;
    if (originSet.has(airport.iata)) continue;

    if (req.regions.length > 0) {
      const region = regionOf(airport.tz);
      if (!region || !req.regions.includes(region)) continue;
    }

    // Distance is measured from the NEAREST origin, since any of them may be
    // the one actually flown.
    let nearest = Infinity;
    for (const origin of origins) {
      const d = distanceBetween(origin, airport.iata);
      if (d !== null && d < nearest) nearest = d;
    }
    if (!Number.isFinite(nearest)) continue;
    if (nearest < req.minDistanceKm) continue;
    if (nearest > maxKm) continue;

    out.push(airport);
  }

  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ExploreOptions {
  signal?: AbortSignal;
}

export async function runExplore(
  req: ExploreRequest,
  opts: ExploreOptions = {},
): Promise<ExploreResponse> {
  const started = Date.now();
  const warnings: string[] = [];

  const origins = req.origins.filter((o) => getAirport(o) !== undefined);
  if (origins.length === 0) {
    throw new Error("No recognised origin airports");
  }

  const candidates = pickCandidates(req, origins);
  if (candidates.length === 0) {
    return {
      results: [],
      candidatesPriced: 0,
      overBudget: 0,
      currency: req.currency,
      elapsedMs: Date.now() - started,
      warnings: ["No destinations matched those region and distance filters."],
    };
  }

  const returnDate =
    req.tripLengthDays !== undefined ? addDays(req.departureDate, req.tripLengthDays) : undefined;

  /** Cheapest offer seen per destination, across every chunk and origin. */
  const best = new Map<string, ExploreResult>();
  let priced = 0;
  let overBudget = 0;

  for (const group of chunk(candidates, DESTINATIONS_PER_CALL)) {
    if (opts.signal?.aborted) break;

    // Explore wants breadth, not depth: a handful of fares per route is enough
    // to establish a destination's price, and keeps the call budget usable.
    const search = SearchRequest.parse({
      origins,
      destinations: group.map((a) => a.iata),
      departureDate: req.departureDate,
      ...(returnDate ? { returnDate } : {}),
      adults: req.adults,
      cabin: req.cabin,
      currency: req.currency,
      maxPerPair: 6,
      flexDays: req.flexDays,
      ...(req.maxStops !== undefined ? { maxStops: req.maxStops } : {}),
      ...(req.maxPrice !== undefined ? { maxPrice: req.maxPrice } : {}),
      sort: "price",
    });

    let response;
    try {
      response = await runSearch(search, opts.signal ? { signal: opts.signal } : {});
    } catch (err) {
      logger.warn("explore chunk failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    priced += response.totalBeforeFilters;
    overBudget += Math.max(0, response.totalBeforeFilters - response.offers.length);

    for (const offer of response.offers) {
      const airport = getAirport(offer.destination);
      if (!airport) continue;

      const existing = best.get(offer.destination);
      if (existing && existing.price <= offer.price.total) continue;

      const outbound =
        offer.itineraries.find((i) => i.direction === "outbound") ?? offer.itineraries[0];
      if (!outbound) continue;

      const distance = distanceBetween(offer.origin, offer.destination);

      const result: ExploreResult = {
        destination: airport,
        region: regionOf(airport.tz),
        origin: offer.origin,
        price: offer.price.total,
        currency: offer.price.currency,
        departureDate: outbound.departureAt.slice(0, 10),
        durationMinutes: offer.totalDurationMinutes,
        stops: offer.maxStops,
        airlines: offer.airlines.map((a) => a.name),
        distanceKm: Math.round(offer.distanceKm ?? distance ?? 0),
        offerId: offer.id,
      };

      const inbound = offer.itineraries.find((i) => i.direction === "inbound");
      if (inbound) result.returnDate = inbound.departureAt.slice(0, 10);
      if (offer.co2Kg !== undefined) result.co2Kg = offer.co2Kg;
      if (offer.deepLink) result.deepLink = offer.deepLink;

      best.set(offer.destination, result);
    }
  }

  const results = [...best.values()];
  results.sort((a, b) => {
    switch (req.sort) {
      case "distance":
        return a.distanceKm - b.distanceKm || a.price - b.price;
      case "duration":
        return a.durationMinutes - b.durationMinutes || a.price - b.price;
      default:
        return a.price - b.price || a.destination.iata.localeCompare(b.destination.iata);
    }
  });

  if (candidates.length < req.candidates) {
    warnings.push(
      `Only ${candidates.length} destinations matched your filters (asked for ${req.candidates}).`,
    );
  }
  if (results.length === 0 && priced > 0) {
    warnings.push("Every destination priced above your budget — try raising it.");
  }

  return {
    results: results.slice(0, req.limit),
    candidatesPriced: candidates.length,
    overBudget,
    currency: req.currency,
    elapsedMs: Date.now() - started,
    warnings,
  };
}
