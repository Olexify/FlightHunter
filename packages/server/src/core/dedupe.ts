import type { FlightOffer, ProviderId } from "@flighthunter/shared";

/** Lower number wins when the same itinerary comes back from two sources. */
const PROVIDER_RANK: Record<ProviderId, number> = {
  amadeus: 0,
  travelpayouts: 1,
  mock: 2,
};

/**
 * Identity of a trip, independent of who quoted it: the actual flights flown.
 * Falls back to route + times when a provider gives no segment detail.
 *
 * Keyed on carrier CODES rather than display names — the previous version
 * hashed names, so "TK" from one provider and "Turkish Airlines" from another
 * never collapsed into a single row.
 */
function signature(offer: FlightOffer): string {
  const legs = offer.itineraries.map((it) => {
    if (it.segments.length > 0) {
      return it.segments
        .map((s) => `${s.carrierCode}${s.flightNumber ?? ""}@${s.departureAt}>${s.to}`)
        .join("+");
    }
    return `${it.direction}:${it.departureAt}>${it.arrivalAt}:${it.stops}`;
  });

  // Carriers belong in the identity. Without segment detail the leg key above
  // is just times and stop counts, so a Lufthansa and a Turkish fare departing
  // at the same minute with the same number of stops would otherwise collapse
  // into one row and the cheaper airline would silently erase the other.
  const carriers = offer.airlines
    .map((a) => a.code.toUpperCase())
    .sort()
    .join(",");

  // Fare brand is part of the identity: Basic and Flex on the SAME flight are
  // two genuinely different products at different prices, and collapsing them
  // would throw away most of a route's real price spread.
  return `${offer.origin}-${offer.destination}|${carriers}|${legs.join("||")}|${offer.fareBrand ?? "-"}`;
}

/**
 * Collapses duplicate itineraries, keeping the best-priced quote. Ties break
 * toward the richer provider so we retain segment detail and a live price
 * rather than a cached fare with no routing.
 */
export function dedupeOffers(offers: FlightOffer[]): FlightOffer[] {
  const best = new Map<string, FlightOffer>();

  for (const offer of offers) {
    const key = signature(offer);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, offer);
      continue;
    }

    const cheaper = offer.price.total < existing.price.total;
    const samePrice = offer.price.total === existing.price.total;
    const betterSource = PROVIDER_RANK[offer.provider] < PROVIDER_RANK[existing.provider];

    if (cheaper || (samePrice && betterSource)) best.set(key, offer);
  }

  return [...best.values()];
}
