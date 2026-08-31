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

const connecting = (via: string, carrier = "TK") =>
  offer({
    airlines: [{ code: carrier, name: carrier }],
    itineraries: [
      itinerary({
        segments: [
          segment({ from: "WAW", to: via, carrierCode: carrier, layoverMinutes: 90 }),
          segment({ from: via, to: "NRT", carrierCode: carrier }),
        ],
      }),
    ],
  });

describe("alliance filter", () => {
  it("keeps carriers in the selected alliance", () => {
    const star = offer({ airlines: [{ code: "LH", name: "Lufthansa" }] });
    expect(applyFilters([star], req({ alliances: ["STAR_ALLIANCE"] })).kept).toHaveLength(1);
  });

  it("drops carriers outside it", () => {
    const skyteam = offer({ airlines: [{ code: "AF", name: "Air France" }] });
    expect(applyFilters([skyteam], req({ alliances: ["STAR_ALLIANCE"] })).kept).toHaveLength(0);
  });

  it("accepts an offer if ANY of its carriers qualifies", () => {
    const mixed = offer({
      airlines: [
        { code: "AF", name: "Air France" },
        { code: "LH", name: "Lufthansa" },
      ],
    });
    expect(applyFilters([mixed], req({ alliances: ["STAR_ALLIANCE"] })).kept).toHaveLength(1);
  });
});

describe("low-cost filter", () => {
  it("removes low-cost carriers when asked", () => {
    const ryanair = offer({ airlines: [{ code: "FR", name: "Ryanair" }] });
    const lufthansa = offer({ id: "b", airlines: [{ code: "LH", name: "Lufthansa" }] });
    const kept = applyFilters([ryanair, lufthansa], req({ excludeLowCost: true })).kept;
    expect(kept).toHaveLength(1);
    expect(kept[0]?.airlines[0]?.code).toBe("LH");
  });
});

describe("fare family filter", () => {
  it("keeps only the selected brands", () => {
    const basic = offer({ id: "basic", fareBrand: "BASIC" });
    const flex = offer({ id: "flex", fareBrand: "FLEX" });
    const kept = applyFilters([basic, flex], req({ fareBrands: ["FLEX"] })).kept;
    expect(kept.map((o) => o.id)).toEqual(["flex"]);
  });
});

describe("checked bag requirement", () => {
  it("drops fares with no checked bag", () => {
    const noBag = offer({ id: "n", baggage: { carryOnIncluded: true, checkedBags: 0 } });
    const withBag = offer({ id: "y", baggage: { carryOnIncluded: true, checkedBags: 1, checkedKg: 23 } });
    const kept = applyFilters([noBag, withBag], req({ requireCheckedBag: true })).kept;
    expect(kept.map((o) => o.id)).toEqual(["y"]);
  });

  it("does not drop offers whose provider reports no baggage data at all", () => {
    // Amadeus results carry no baggage field; silently filtering them all out
    // would make the option look broken rather than selective.
    const unknown = offer({ id: "u" });
    expect(applyFilters([unknown], req({ requireCheckedBag: true })).kept).toHaveLength(1);
  });
});

describe("routing filters", () => {
  it("avoids named connection airports", () => {
    const viaLhr = connecting("LHR");
    expect(applyFilters([viaLhr], req({ avoidAirports: ["LHR"] })).kept).toHaveLength(0);
  });

  it("requires a named connection airport", () => {
    const viaIst = connecting("IST");
    const viaFra = connecting("FRA");
    const kept = applyFilters([viaIst, viaFra], req({ viaAirports: ["IST"] })).kept;
    expect(kept).toHaveLength(1);
  });

  it("never treats the origin or destination as a connection", () => {
    // A direct flight has no connections, so "avoid WAW" must not remove it.
    const direct = offer();
    expect(applyFilters([direct], req({ avoidAirports: ["WAW", "NRT"] })).kept).toHaveLength(1);
  });

  it("caps the number of flights per leg", () => {
    const twoFlights = connecting("IST");
    expect(applyFilters([twoFlights], req({ maxSegments: 1 })).kept).toHaveLength(0);
    expect(applyFilters([twoFlights], req({ maxSegments: 2 })).kept).toHaveLength(1);
  });
});

describe("red-eye filter", () => {
  it("removes departures in the small hours", () => {
    const redEye = offer({
      itineraries: [itinerary({ segments: [segment({ departureAt: "2026-10-15T02:30:00" })] })],
    });
    expect(applyFilters([redEye], req({ avoidRedEye: true })).kept).toHaveLength(0);
  });

  it("keeps an early-morning departure at 05:30", () => {
    const early = offer({
      itineraries: [itinerary({ segments: [segment({ departureAt: "2026-10-15T05:30:00" })] })],
    });
    expect(applyFilters([early], req({ avoidRedEye: true })).kept).toHaveLength(1);
  });

  it("also checks the return leg", () => {
    const nightReturn = offer({
      itineraries: [
        itinerary({ direction: "outbound", segments: [segment({ departureAt: "2026-10-15T10:00:00" })] }),
        itinerary({
          direction: "inbound",
          segments: [segment({ from: "NRT", to: "WAW", departureAt: "2026-10-29T03:15:00" })],
        }),
      ],
    });
    expect(applyFilters([nightReturn], req({ avoidRedEye: true })).kept).toHaveLength(0);
  });
});
