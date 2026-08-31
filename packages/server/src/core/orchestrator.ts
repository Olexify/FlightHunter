import { randomUUID } from "node:crypto";
import type {
  FlightOffer,
  PriceGridCell,
  ProviderStatus,
  SearchRequest,
  SearchResponse,
} from "@flighthunter/shared";
import { addDays, DEFAULT_RANKING_WEIGHTS } from "@flighthunter/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { expandMetroCodes, nearbyAirports, partitionKnown } from "../data/airports.js";
import { describeAmadeusError } from "../providers/amadeus.js";
import { activeProviders, isMockOnly } from "../providers/registry.js";
import type { FlightProvider, RoutePair } from "../providers/types.js";
import { TtlCache } from "../util/cache.js";
import { createLimiter } from "../util/semaphore.js";
import { dedupeOffers } from "./dedupe.js";
import { applyFilters } from "./filters.js";
import { scoreOffers, sortOffers } from "./rank.js";

/**
 * Upper bound on upstream calls for a single search. Without this, 30 origins
 * × 30 destinations × a ±7-day flex window is 13,500 provider requests — which
 * would blow every rate limit and quota in one click.
 */
const MAX_PROVIDER_CALLS = 400;
/** How many of the cheapest routes get explored across flexible dates. */
const FLEX_PAIR_BUDGET = 10;

const cache = new TtlCache<FlightOffer[]>(
  config.CACHE_MAX_ENTRIES,
  config.CACHE_TTL_SECONDS * 1000,
);

export function cacheStats() {
  return cache.stats();
}

export function clearSearchCache(): void {
  cache.clear();
}

/**
 * Cache identity must include EVERY field that changes what a provider
 * returns. The previous key omitted passenger counts, so a 1-adult search
 * would serve its prices to a subsequent 4-adult search for 15 minutes.
 */
function cacheKey(provider: FlightProvider, pair: RoutePair, req: SearchRequest): string {
  return [
    provider.id,
    pair.origin,
    pair.destination,
    pair.departureDate,
    pair.returnDate ?? "-",
    req.cabin,
    req.adults,
    req.children,
    req.infants,
    req.currency,
    req.maxPerPair,
    req.maxStops ?? "-",
    req.includeAirlines.join(",") || "-",
    req.excludeAirlines.join(",") || "-",
  ].join("|");
}

export interface SearchOptions {
  signal?: AbortSignal;
  /** Called with the final offer set, e.g. to persist price history. */
  onResults?: (offers: FlightOffer[], req: SearchRequest) => void;
}

/** Expand each origin with nearby airports the traveller could reasonably use. */
function expandOrigins(req: SearchRequest): { origins: string[]; added: string[] } {
  if (req.nearbyRadiusKm <= 0) return { origins: [...req.origins], added: [] };

  const set = new Set(req.origins);
  const added: string[] = [];

  for (const origin of req.origins) {
    for (const near of nearbyAirports(origin, req.nearbyRadiusKm, 3)) {
      if (!set.has(near.iata)) {
        set.add(near.iata);
        added.push(near.iata);
      }
    }
  }
  // Keep the total sane; nearby expansion must not explode the call budget.
  return { origins: [...set].slice(0, 30), added };
}

async function callProvider(
  provider: FlightProvider,
  pair: RoutePair,
  req: SearchRequest,
  status: Map<string, ProviderStatus>,
  signal: AbortSignal | undefined,
): Promise<FlightOffer[]> {
  const entry = status.get(provider.id);
  const key = cacheKey(provider, pair, req);

  const cached = cache.get(key);
  if (cached) {
    // Cached offers still count toward what this provider contributed —
    // otherwise the status panel reports 0 offers on every warm search.
    if (entry) {
      entry.offers += cached.length;
      entry.cacheHits++;
    }
    return cached;
  }

  const started = Date.now();

  try {
    const offers = await provider.search(pair, req, signal ? { signal } : {});

    // Only cache real results. Caching an empty array meant one transient
    // upstream failure blacklisted that route for the whole TTL.
    if (offers.length > 0) cache.set(key, offers);

    if (entry) {
      entry.offers += offers.length;
      entry.elapsedMs += Date.now() - started;
    }
    return offers;
  } catch (err) {
    const message =
      provider.id === "amadeus"
        ? describeAmadeusError(err)
        : err instanceof Error
          ? err.message
          : String(err);

    if (entry) {
      entry.ok = false;
      entry.elapsedMs += Date.now() - started;
      const line = `${pair.origin}→${pair.destination} ${pair.departureDate}: ${message}`;
      // Cap the list so one broken provider cannot flood the response.
      if (entry.errors.length < 10 && !entry.errors.includes(line)) entry.errors.push(line);
    }
    logger.warn(`provider ${provider.id} failed`, { pair, message });
    return [];
  }
}

export async function runSearch(
  req: SearchRequest,
  opts: SearchOptions = {},
): Promise<SearchResponse> {
  const started = Date.now();
  const searchId = randomUUID();
  const warnings: string[] = [];

  const providers = activeProviders();
  if (providers.length === 0) {
    throw new Error("No flight providers are available");
  }

  const status = new Map<string, ProviderStatus>(
    providers.map((p) => [
      p.id,
      { provider: p.id, ok: true, offers: 0, cacheHits: 0, errors: [], elapsedMs: 0 },
    ]),
  );

  // Metro codes (NYC, LON, TYO) become their member airports before validation.
  const originMetro = expandMetroCodes(req.origins);
  const destMetro = expandMetroCodes(req.destinations);
  const metroAdded = [...originMetro.expanded, ...destMetro.expanded];
  if (metroAdded.length > 0) {
    warnings.push(`Expanded city code(s) to airports: ${metroAdded.join(", ")}`);
  }

  // Unknown IATA codes are reported rather than silently searched and failed.
  const originCheck = partitionKnown(originMetro.codes);
  const destCheck = partitionKnown(destMetro.codes);
  for (const code of [...originCheck.unknown, ...destCheck.unknown]) {
    warnings.push(`Unknown airport code "${code}" — skipped.`);
  }
  if (originCheck.known.length === 0 || destCheck.known.length === 0) {
    throw new Error("No recognised airport codes in this search");
  }

  const expanded = expandOrigins({ ...req, origins: originCheck.known });
  if (expanded.added.length > 0) {
    warnings.push(`Added ${expanded.added.length} nearby origin(s): ${expanded.added.join(", ")}`);
  }

  const basePairs: RoutePair[] = [];
  for (const o of expanded.origins) {
    for (const d of destCheck.known) {
      if (o === d) continue;
      basePairs.push({
        origin: o,
        destination: d,
        departureDate: req.departureDate,
        ...(req.returnDate ? { returnDate: req.returnDate } : {}),
      });
    }
  }

  const limit = createLimiter(config.PROVIDER_CONCURRENCY);
  let budget = MAX_PROVIDER_CALLS;
  let lookups = 0;

  const runPass = async (pairs: RoutePair[]): Promise<FlightOffer[]> => {
    const jobs: Array<Promise<FlightOffer[]>> = [];
    for (const pair of pairs) {
      for (const provider of providers) {
        if (budget <= 0) break;
        budget--;
        lookups++;
        jobs.push(limit(() => callProvider(provider, pair, req, status, opts.signal)));
      }
    }
    const settled = await Promise.all(jobs);
    return settled.flat();
  };

  const collected = await runPass(basePairs);

  if (budget <= 0) {
    warnings.push(
      `Search capped at ${MAX_PROVIDER_CALLS} provider calls — narrow the airports or date range for full coverage.`,
    );
  }

  /* ----------------------- flexible-date exploration ----------------------- */

  const gridOffers: FlightOffer[] = [...collected];

  if (req.flexDays > 0 && budget > 0) {
    // Only widen the dates on routes that already look competitive, so the
    // call budget is spent where a cheaper date is actually plausible.
    const cheapestByRoute = new Map<string, number>();
    for (const o of collected) {
      const k = `${o.origin}-${o.destination}`;
      const prev = cheapestByRoute.get(k);
      if (prev === undefined || o.price.total < prev) cheapestByRoute.set(k, o.price.total);
    }

    const ranked = [...cheapestByRoute.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, FLEX_PAIR_BUDGET)
      .map(([k]) => k);

    const flexPairs: RoutePair[] = [];
    for (const routeKey of ranked) {
      const [o, d] = routeKey.split("-") as [string, string];
      for (let delta = -req.flexDays; delta <= req.flexDays; delta++) {
        if (delta === 0) continue;
        const departureDate = addDays(req.departureDate, delta);
        // Never propose a departure in the past.
        if (departureDate < new Date().toISOString().slice(0, 10)) continue;
        flexPairs.push({
          origin: o,
          destination: d,
          departureDate,
          ...(req.returnDate ? { returnDate: addDays(req.returnDate, delta) } : {}),
        });
      }
    }

    if (flexPairs.length > 0) {
      // Flex results feed the price grid ONLY. Mixing them into the result
      // list would silently show flights on dates the user did not ask for;
      // the grid surfaces the cheaper date and they can re-search it.
      gridOffers.push(...(await runPass(flexPairs)));
    }
  }

  /* ------------------------------- shaping -------------------------------- */

  const deduped = dedupeOffers(collected);
  const totalBeforeFilters = deduped.length;

  const { kept, rejected } = applyFilters(deduped, req);
  if (kept.length === 0 && rejected.length > 0) {
    warnings.push(`All ${rejected.length} result(s) were removed by your filters — try relaxing them.`);
  }

  scoreOffers(kept, req.rankingWeights ?? DEFAULT_RANKING_WEIGHTS);
  sortOffers(kept, req.sort);

  /* ------------------------------ price grid ------------------------------ */

  const gridMap = new Map<string, PriceGridCell>();
  for (const o of dedupeOffers(gridOffers)) {
    const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
    if (!out) continue;
    const date = out.departureAt.slice(0, 10);
    const existing = gridMap.get(date);
    if (!existing || existing.cheapestPrice === null || o.price.total < existing.cheapestPrice) {
      gridMap.set(date, {
        departureDate: date,
        cheapestPrice: o.price.total,
        currency: o.price.currency,
        offerId: o.id,
      });
    }
  }
  const priceGrid = [...gridMap.values()].sort((a, b) =>
    a.departureDate.localeCompare(b.departureDate),
  );

  if (isMockOnly()) {
    warnings.push("Showing sample data — no provider API keys are configured.");
  }

  const totalCacheHits = [...status.values()].reduce((n, s2) => n + s2.cacheHits, 0);
  const totalLookups = lookups;

  opts.onResults?.(kept, req);

  return {
    searchId,
    offers: kept,
    totalBeforeFilters,
    providers: [...status.values()],
    priceGrid,
    expandedOrigins: expanded.added,
    currency: req.currency,
    // True when every provider lookup was served from cache.
    cached: totalLookups > 0 && totalCacheHits === totalLookups,
    elapsedMs: Date.now() - started,
    warnings,
  };
}
