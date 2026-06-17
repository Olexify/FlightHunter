import type { NormalizedFlight, SearchParams } from "./types.js";

function pseudoRand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 10000) / 10000;
}

export function buildMockResults(p: SearchParams): NormalizedFlight[] {
  const results: NormalizedFlight[] = [];

  for (const origin of p.origins) {
    for (const dest of p.destinations) {
      const r = pseudoRand(`${origin}-${dest}-${p.departureDate}`);
      const base = origin === "IST" || origin === "BUD" ? 320 : 420;
      const price = Math.round(base + r * 450);
      const stops = r < 0.15 ? 0 : r < 0.7 ? 1 : 2;
      const duration = stops === 0 ? 780 : stops === 1 ? 960 + Math.floor(r * 240) : 1200 + Math.floor(r * 300);
      const dep = new Date(`${p.departureDate}T${String(6 + Math.floor(r * 14)).padStart(2, "0")}:00:00Z`);
      const arr = new Date(dep.getTime() + duration * 60000);
      const carrier = stops === 0 ? "TK" : r < 0.33 ? "QR" : r < 0.66 ? "EK" : "AY";

      results.push({
        id: `mock-${origin}-${dest}`,
        source: "mock",
        origin,
        destination: dest,
        price,
        currency: p.currency,
        airlines: [carrier],
        stops,
        durationMinutes: duration,
        departureAt: dep.toISOString(),
        arrivalAt: arr.toISOString(),
        legs: [],
        warnings: ["Mock data — add Amadeus API keys for real prices"],
      });
    }
  }
  return results;
}