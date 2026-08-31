import { describe, expect, it } from "vitest";
import { SearchRequest } from "@flighthunter/shared";
import { applyFilters } from "./filters.js";
import { itinerary, offer, segment } from "../testFixtures.js";

const req = (over: Record<string, unknown> = {}) =>
  SearchRequest.parse({
    origins: ["WAW"],
    destinations: ["NRT"],
    departureDate: "2026-10-15",
    ...over,
  });

describe("maxStops", () => {
  it("compares against the WORST leg of a round trip", () => {
    // Nonstop out, two-stop back. The old code only looked at the outbound
    // itinerary, so this leaked through a "direct only" filter.
    const roundTrip = offer({
      itineraries: [
        itinerary({ direction: "outbound", segments: [segment()] }),
        itinerary({
          direction: "inbound",
          segments: [
            segment({ from: "NRT", to: "IST" }),
            segment({ from: "IST", to: "FRA" }),
            segment({ from: "FRA", to: "WAW" }),
          ],
        }),
      ],
    });

    expect(roundTrip.maxStops).toBe(2);
    expect(applyFilters([roundTrip], req({ maxStops: 0 })).kept).toHaveLength(0);
    expect(applyFilters([roundTrip], req({ maxStops: 2 })).kept).toHaveLength(1);
  });

  it("keeps genuinely direct flights", () => {
    expect(applyFilters([offer()], req({ maxStops: 0 })).kept).toHaveLength(1);
  });
});

describe("airline filters", () => {
  it("matches on carrier CODE regardless of display name", () => {
    const o = offer({ airlines: [{ code: "TK", name: "Turkish Airlines" }] });
    expect(applyFilters([o], req({ includeAirlines: ["TK"] })).kept).toHaveLength(1);
    expect(applyFilters([o], req({ excludeAirlines: ["TK"] })).kept).toHaveLength(0);
    expect(applyFilters([o], req({ includeAirlines: ["LH"] })).kept).toHaveLength(0);
  });

  it("keeps an offer when any of its carriers is included", () => {
    const o = offer({
      airlines: [
        { code: "LO", name: "LOT" },
        { code: "NH", name: "ANA" },
      ],
    });
    expect(applyFilters([o], req({ includeAirlines: ["NH"] })).kept).toHaveLength(1);
  });
});

describe("budget and duration", () => {
  it("drops offers over the price ceiling", () => {
    const o = offer({ price: { total: 900, currency: "EUR" } });
    expect(applyFilters([o], req({ maxPrice: 800 })).kept).toHaveLength(0);
    expect(applyFilters([o], req({ maxPrice: 1000 })).kept).toHaveLength(1);
  });

  it("drops offers longer than the duration cap", () => {
    const o = offer(); // 720 minutes
    expect(applyFilters([o], req({ maxDurationMinutes: 600 })).kept).toHaveLength(0);
    expect(applyFilters([o], req({ maxDurationMinutes: 900 })).kept).toHaveLength(1);
  });
});

describe("layover bounds", () => {
  const connecting = offer({
    itineraries: [
      itinerary({
        segments: [
          segment({ from: "WAW", to: "IST", layoverMinutes: 45 }),
          segment({ from: "IST", to: "NRT" }),
        ],
      }),
    ],
  });

  it("rejects layovers below the minimum", () => {
    expect(applyFilters([connecting], req({ minLayoverMinutes: 90 })).kept).toHaveLength(0);
  });

  it("rejects layovers above the maximum", () => {
    expect(applyFilters([connecting], req({ maxLayoverMinutes: 30 })).kept).toHaveLength(0);
  });

  it("accepts layovers inside the window", () => {
    expect(
      applyFilters([connecting], req({ minLayoverMinutes: 30, maxLayoverMinutes: 120 })).kept,
    ).toHaveLength(1);
  });
});

describe("time-of-day windows", () => {
  it("filters on the outbound departure time", () => {
    const morning = offer({
      itineraries: [itinerary({ segments: [segment({ departureAt: "2026-10-15T07:30:00" })] })],
    });
    expect(applyFilters([morning], req({ departAfter: "09:00" })).kept).toHaveLength(0);
    expect(applyFilters([morning], req({ departBefore: "09:00" })).kept).toHaveLength(1);
  });
});

describe("rejection reporting", () => {
  it("explains why each offer was removed", () => {
    const o = offer({ price: { total: 900, currency: "EUR" } });
    const { kept, rejected } = applyFilters([o], req({ maxPrice: 100 }));
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toBe("over budget");
  });
});
