import type { FlightOffer, SortKey } from "@flighthunter/shared";
import { minutesIntoDay } from "@flighthunter/shared";

/**
 * "Best" ranking. Cheapest is rarely what a traveller actually wants — a fare
 * €20 lower that costs nine extra hours and a second connection is a worse
 * trip. Each dimension is normalised across the result set, then weighted.
 */

const WEIGHTS = { price: 0.6, duration: 0.4 } as const;
/** Each connection is treated as roughly an 8% penalty on the trip. */
const STOP_PENALTY = 0.08;

/**
 * Penalty is measured as *proportional excess over the best in the set*, not
 * as a min-max position.
 *
 * Min-max throws magnitude away: with two results, the dearer one scores a
 * full 1.0 on price whether it costs €10 or €1000 more. That made a €60
 * premium look as bad as doubling the fare, so a nonstop could never beat a
 * marginally cheaper 22-hour double-connection. Ratios keep the magnitude, so
 * "12% dearer" is scored as 12%.
 */
function excess(value: number, best: number): number {
  if (!Number.isFinite(value) || best <= 0) return 0;
  return Math.max(0, value / best - 1);
}

/** Attaches a 0-100 score to every offer (higher = better) and returns them. */
export function scoreOffers(offers: FlightOffer[]): FlightOffer[] {
  if (offers.length === 0) return offers;

  let bestPrice = Infinity;
  let bestDuration = Infinity;

  for (const o of offers) {
    if (o.price.total > 0) bestPrice = Math.min(bestPrice, o.price.total);
    if (o.totalDurationMinutes > 0) bestDuration = Math.min(bestDuration, o.totalDurationMinutes);
  }
  if (!Number.isFinite(bestPrice)) bestPrice = 1;
  if (!Number.isFinite(bestDuration)) bestDuration = 1;

  for (const o of offers) {
    const penalty =
      WEIGHTS.price * excess(o.price.total, bestPrice) +
      WEIGHTS.duration * excess(o.totalDurationMinutes, bestDuration) +
      STOP_PENALTY * o.maxStops;

    // A penalty of 1.0 or more bottoms out at zero rather than going negative.
    o.score = Math.round(Math.max(0, 1 - penalty) * 1000) / 10;
  }

  return offers;
}

function departureMinutes(o: FlightOffer): number {
  const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
  return out ? (minutesIntoDay(out.departureAt) ?? 0) : 0;
}

function arrivalMinutes(o: FlightOffer): number {
  const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
  return out ? (minutesIntoDay(out.arrivalAt) ?? 0) : 0;
}

/**
 * Sorts in place. Every comparator falls back to price then id so ordering is
 * total and stable — otherwise equal-scoring rows shuffle between renders.
 */
export function sortOffers(offers: FlightOffer[], key: SortKey): FlightOffer[] {
  const byPriceThenId = (a: FlightOffer, b: FlightOffer): number =>
    a.price.total - b.price.total || a.id.localeCompare(b.id);

  offers.sort((a, b) => {
    switch (key) {
      case "best":
        return (b.score ?? 0) - (a.score ?? 0) || byPriceThenId(a, b);
      case "price":
        return byPriceThenId(a, b);
      case "duration":
        return a.totalDurationMinutes - b.totalDurationMinutes || byPriceThenId(a, b);
      case "stops":
        return a.maxStops - b.maxStops || byPriceThenId(a, b);
      case "departure":
        return departureMinutes(a) - departureMinutes(b) || byPriceThenId(a, b);
      case "arrival":
        return arrivalMinutes(a) - arrivalMinutes(b) || byPriceThenId(a, b);
      default:
        return byPriceThenId(a, b);
    }
  });

  return offers;
}
