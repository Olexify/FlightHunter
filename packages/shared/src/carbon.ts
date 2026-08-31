/**
 * Per-passenger CO2 estimates.
 *
 * Simplified from the ICAO/DEFRA methodology: emissions per passenger-kilometre
 * fall as distance rises, because climb-out burns disproportionately more fuel
 * than cruise. Figures are economy-class averages and are deliberately labelled
 * as estimates in the UI — they are not a substitute for an airline's own data.
 */

/** kg CO2 per passenger-kilometre, by trip distance band. */
function kgPerPassengerKm(distanceKm: number): number {
  if (distanceKm < 500) return 0.234;
  if (distanceKm < 1500) return 0.156;
  if (distanceKm < 3500) return 0.131;
  return 0.115;
}

/** Premium cabins occupy more floor area, so they carry a larger share. */
const CABIN_FACTOR: Record<string, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.6,
  BUSINESS: 2.9,
  FIRST: 4.0,
};

/**
 * Estimated kg of CO2 per passenger for a journey.
 *
 * `distanceKm` should be the summed great-circle distance of every flown
 * segment, not origin-to-destination — a connection through Dubai really does
 * burn the extra kilometres.
 */
export function estimateCo2Kg(distanceKm: number, cabin = "ECONOMY"): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const base = distanceKm * kgPerPassengerKm(distanceKm);
  return Math.round(base * (CABIN_FACTOR[cabin] ?? 1));
}

/** Rough comparison anchor: average EU car, 1 occupant, ~0.17 kg CO2/km. */
export function co2AsCarKm(kg: number): number {
  return Math.round(kg / 0.17);
}

/**
 * Relative rating against a typical direct flight of the same distance, so a
 * long-haul trip is not automatically branded "bad".
 */
export function co2Rating(kg: number, directDistanceKm: number): "low" | "average" | "high" {
  const baseline = estimateCo2Kg(directDistanceKm);
  if (baseline <= 0) return "average";
  const ratio = kg / baseline;
  if (ratio <= 1.08) return "low";
  if (ratio <= 1.35) return "average";
  return "high";
}
