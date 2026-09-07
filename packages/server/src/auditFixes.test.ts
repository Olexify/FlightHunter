import { beforeEach, describe, expect, it } from "vitest";
import { SearchRequest, formatPrice } from "@flighthunter/shared";
import { applyFilters } from "./core/filters.js";
import { dedupeOffers } from "./core/dedupe.js";
import { scoreOffers, sortOffers } from "./core/rank.js";
import { clearSearchCache, runSearch } from "./core/orchestrator.js";
import { expandMetroCodes, getAirport, searchAirports } from "./data/airports.js";
import { MockProvider } from "./providers/mock.js";
import { itinerary, offer, segment } from "./testFixtures.js";

/**
 * Regressions for defects found by the adversarial audit. Each test fails
 * against the code as it was before the corresponding fix.
 */

const req = (over: Record<string, unknown> = {}) =>
  SearchRequest.parse({
    origins: ["WAW"],
    destinations: ["NRT"],
    departureDate: "2026-11-20",
    ...over,
  });

/* ------------------------------------------------------------------ */
/* filters: provider-blind constraints                                 */
/* ------------------------------------------------------------------ */

describe("fare family filter tolerates providers that report no brand", () => {
  it("keeps an offer with no fareBrand instead of rejecting it", () => {
    // Only the mock provider sets fareBrand. Rejecting on absence emptied the
    // entire result set in any deployment with real API keys.
    const amadeusShaped = offer({ id: "am" });
    expect(applyFilters([amadeusShaped], req({ fareBrands: ["BASIC"] })).kept).toHaveLength(1);
  });

  it("still filters offers that DO declare a brand", () => {
    const basic = offer({ id: "b", fareBrand: "BASIC" });
    const flex = offer({ id: "f", fareBrand: "FLEX" });
    const kept = applyFilters([basic, flex], req({ fareBrands: ["FLEX"] })).kept;
    expect(kept.map((o) => o.id)).toEqual(["f"]);
  });
});

describe("maxSegments works without segment detail", () => {
  const segmentless = (stops: number) =>
    offer({
      id: `s${stops}`,
      itineraries: [itinerary({ segments: [], stops, departureAt: "2026-11-20T08:00:00" })],
      maxStops: stops,
    });

  it("derives flight count from stops when the provider gives no segments", () => {
    // A 3-stop fare is 4 flights. `segments.length > maxSegments` was 0 > 1,
    // so Travelpayouts fares sailed through a "one flight per leg" filter.
    expect(applyFilters([segmentless(3)], req({ maxSegments: 1 })).kept).toHaveLength(0);
  });

  it("keeps a genuine nonstop under the same limit", () => {
    expect(applyFilters([segmentless(0)], req({ maxSegments: 1 })).kept).toHaveLength(1);
  });
});

describe("routing filters report what they could not check", () => {
  const segmentless = offer({
    id: "tp",
    itineraries: [itinerary({ segments: [], stops: 1, departureAt: "2026-11-20T08:00:00" })],
  });

  it("counts unverifiable offers rather than silently passing them", () => {
    const result = applyFilters([segmentless], req({ avoidAirports: ["IST"] }));
    expect(result.kept).toHaveLength(1);
    expect(result.unverifiableRouting).toBe(1);
  });

  it("reports nothing unverifiable when no routing filter is active", () => {
    expect(applyFilters([segmentless], req()).unverifiableRouting).toBe(0);
  });

  it("still enforces routing on offers that DO have segments", () => {
    const viaIst = offer({
      id: "am",
      itineraries: [
        itinerary({
          segments: [segment({ from: "WAW", to: "IST" }), segment({ from: "IST", to: "NRT" })],
        }),
      ],
    });
    expect(applyFilters([viaIst], req({ avoidAirports: ["IST"] })).kept).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* rank: unknown duration                                              */
/* ------------------------------------------------------------------ */

describe("an offer with unknown duration is not treated as the fastest", () => {
  const unknown = offer({ id: "unknown", totalDurationMinutes: 0, maxStops: 1 });
  const real = offer({
    id: "real",
    totalDurationMinutes: 700,
    maxStops: 0,
    price: { total: 500, currency: "EUR" },
  });

  it("does not award it a perfect score", () => {
    scoreOffers([unknown, real]);
    expect(real.score).toBeGreaterThan(unknown.score ?? 0);
  });

  it("sorts it last by duration rather than first", () => {
    const sorted = sortOffers([unknown, real], "duration");
    expect(sorted[0]?.id).toBe("real");
  });
});

/* ------------------------------------------------------------------ */
/* dedupe: carrier identity                                            */
/* ------------------------------------------------------------------ */

describe("segment-less fares from different airlines stay separate", () => {
  it("does not collapse two carriers that happen to share times and stops", () => {
    const common = {
      itineraries: [itinerary({ segments: [], stops: 1, departureAt: "2026-11-20T08:00:00" })],
    };
    const lh = offer({ ...common, id: "lh", airlines: [{ code: "LH", name: "Lufthansa" }] });
    const tk = offer({ ...common, id: "tk", airlines: [{ code: "TK", name: "Turkish Airlines" }] });

    expect(dedupeOffers([lh, tk])).toHaveLength(2);
  });

  it("still collapses the same carrier quoted twice", () => {
    const common = {
      itineraries: [itinerary({ segments: [], stops: 1, departureAt: "2026-11-20T08:00:00" })],
      airlines: [{ code: "LH", name: "Lufthansa" }],
    };
    const a = offer({ ...common, id: "a", price: { total: 500, currency: "EUR" } });
    const b = offer({ ...common, id: "b", price: { total: 560, currency: "EUR" } });

    expect(dedupeOffers([a, b])).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* airports: dataset corrections and metro codes                       */
/* ------------------------------------------------------------------ */

describe("airport dataset corrections", () => {
  it("knows Berlin Brandenburg, which the OpenFlights snapshot predates", () => {
    const ber = getAirport("BER");
    expect(ber?.city).toBe("Berlin");
    expect(ber?.tz).toBe("Europe/Berlin");
  });

  it("sinks the permanently closed Berlin airports in autocomplete", () => {
    // TXL/SXF/THF all closed; they must not outrank the operating airport.
    const top = searchAirports("berlin", 4).map((a) => a.iata);
    expect(top[0]).toBe("BER");
  });

  it("ranks an exact code above its own metro siblings", () => {
    // "SHA" is both a metro code and Shanghai Hongqiao itself.
    expect(searchAirports("SHA", 3)[0]?.iata).toBe("SHA");
    expect(searchAirports("TSA", 3)[0]?.iata).toBe("TSA");
  });

  it("still expands a pure metro code to its members", () => {
    const nyc = searchAirports("NYC", 3).map((a) => a.iata);
    expect(nyc).toContain("JFK");
  });

  it("keeps a metro code whose members are all unknown, so it is reported", () => {
    // Dropping it silently produced neither an expansion nor an unknown-code
    // warning — the airport just vanished from the search.
    const { codes, expanded } = expandMetroCodes(["ZZZ"]);
    expect(codes).toEqual(["ZZZ"]);
    expect(expanded).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* mock: plausible routings                                            */
/* ------------------------------------------------------------------ */

describe("mock connections are geographically sensible", () => {
  const provider = new MockProvider();

  it("never routes a short hop through a far-flung hub", async () => {
    // Warsaw->Vienna is 557 km. This used to come back via Beijing at
    // 14,396 km because a random branch ignored the detour entirely.
    const pairs: Array<[string, string, number]> = [
      ["WAW", "VIE", 557],
      ["WAW", "MUC", 900],
      ["WAW", "PRG", 517],
      ["LHR", "CDG", 350],
    ];

    for (const [origin, destination, directKm] of pairs) {
      const offers = await provider.search(
        { origin, destination, departureDate: "2026-11-20" },
        req({ maxPerPair: 60 }),
        {},
      );
      expect(offers.length).toBeGreaterThan(0);

      for (const o of offers) {
        // Allow generous slack for a legitimate connection, but nothing near
        // the 20x detours the old code produced.
        expect(o.distanceKm ?? 0).toBeLessThan(directKm * 3.5);
      }
    }
  });

  it("reports a stop count that matches the routing it built", async () => {
    const offers = await provider.search(
      { origin: "WAW", destination: "VIE", departureDate: "2026-11-20" },
      req({ maxPerPair: 60 }),
      {},
    );
    for (const o of offers) {
      for (const it of o.itineraries) {
        expect(it.stops).toBe(it.segments.length - 1);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* orchestrator: why the alert poller must compute its own minimum     */
/* ------------------------------------------------------------------ */

describe("offers[0] is not the cheapest under the default sort", () => {
  beforeEach(() => clearSearchCache());

  it("documents that 'best' ordering can put a dearer fare first", async () => {
    const result = await runSearch(req({ origins: ["WAW", "KRK"], destinations: ["NRT", "HND"] }));
    expect(result.offers.length).toBeGreaterThan(0);

    const first = result.offers[0]?.price.total ?? 0;
    const min = Math.min(...result.offers.map((o) => o.price.total));

    // The poller therefore takes an explicit minimum instead of offers[0].
    expect(min).toBeLessThanOrEqual(first);
  });

  it("rejects a search whose airports are all unknown with a 400, not a 500", async () => {
    await expect(
      runSearch(req({ origins: ["ZZZ"], destinations: ["QQQ"] })),
    ).rejects.toMatchObject({ status: 400 });
  });
});

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

describe("formatPrice keeps minor units", () => {
  it("does not round a fare to whole currency units", () => {
    // 412.99 rendered as "413" everywhere, and an alert could announce
    // "reached your target of 300" at 300.49.
    expect(formatPrice(412.99, "EUR", "en-GB")).toContain("412.99");
  });

  it("still renders zero-decimal currencies without decimals", () => {
    const yen = formatPrice(41299, "JPY", "en-GB");
    expect(yen).not.toContain(".");
  });
});
