import pLimit from "p-limit";
import type { NormalizedFlight, SearchParams } from "./types.js";
import { searchAmadeusPair } from "./amadeus.js";
import { searchTravelpayoutsPair } from "./travelpayouts.js";
import { buildMockResults } from "./mockData.js";
import { getCached, setCached } from "./cache.js";

const limit = pLimit(4); // respect Amadeus 10 req/s test limit

export async function runMultiSearch(p: SearchParams): Promise<{
  flights: NormalizedFlight[];
  errors: string[];
}> {
  const hasAmadeus = !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
  const errors: string[] = [];

  if (!hasAmadeus) {
    return {
      flights: buildMockResults(p).sort((a, b) => a.price - b.price),
      errors: ["No Amadeus keys — showing mock data. Get free keys at developers.amadeus.com"],
    };
  }

  const pairs: [string, string][] = [];
  for (const o of p.origins) for (const d of p.destinations) pairs.push([o, d]);

  const tasks = pairs.map(([o, d]) =>
    limit(async (): Promise<NormalizedFlight[]> => {
      const key = `${o}-${d}-${p.departureDate}-${p.returnDate ?? ""}-${p.currency}`;
      const cached = getCached(key);
      if (cached) return cached;

      try {
        let results = await searchAmadeusPair(o, d, p);

        // Fallback to Travelpayouts cached prices if Amadeus returns nothing
        if (results.length === 0) {
          results = await searchTravelpayoutsPair(o, d, p.departureDate, p.currency);
        }

        setCached(key, results);
        return results;
      } catch (err: any) {
        errors.push(`${o}→${d}: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
        // Try Travelpayouts as fallback on Amadeus error
        try {
          return await searchTravelpayoutsPair(o, d, p.departureDate, p.currency);
        } catch {
          return [];
        }
      }
    })
  );

  const settled = await Promise.allSettled(tasks);
  const all: NormalizedFlight[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") all.push(...s.value);
  }

  // Apply maxStops filter
  let filtered = all;
  if (typeof p.maxStops === "number") {
    filtered = filtered.filter((f) => f.stops <= p.maxStops!);
  }

  // Dedupe
  const seen = new Set<string>();
  const deduped = filtered.filter((f) => {
    const sig = `${f.airlines.join(",")}-${f.departureAt}-${f.price}-${f.origin}-${f.destination}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  return { flights: deduped.sort((a, b) => a.price - b.price), errors };
}