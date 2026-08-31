import { describe, expect, it } from "vitest";
import { dedupeOffers } from "./dedupe.js";
import { itinerary, offer, segment } from "../testFixtures.js";

describe("dedupeOffers", () => {
  it("collapses the same flight quoted by two providers", () => {
    // Same physical flight. One provider names the carrier, the other only
    // gives the code — keying on names never matched these up.
    const fromAmadeus = offer({
      id: "am-1",
      provider: "amadeus",
      price: { total: 520, currency: "EUR" },
      airlines: [{ code: "TK", name: "Turkish Airlines" }],
    });
    const fromTravelpayouts = offer({
      id: "tp-1",
      provider: "travelpayouts",
      price: { total: 540, currency: "EUR" },
      airlines: [{ code: "TK", name: "TK" }],
    });

    const result = dedupeOffers([fromAmadeus, fromTravelpayouts]);
    expect(result).toHaveLength(1);
    expect(result[0]?.price.total).toBe(520);
  });

  it("keeps the cheaper quote", () => {
    const dear = offer({ id: "a", price: { total: 700, currency: "EUR" } });
    const cheap = offer({ id: "b", price: { total: 400, currency: "EUR" } });
    expect(dedupeOffers([dear, cheap])[0]?.price.total).toBe(400);
  });

  it("prefers the richer provider when prices tie", () => {
    const tp = offer({ id: "tp", provider: "travelpayouts" });
    const am = offer({ id: "am", provider: "amadeus" });
    expect(dedupeOffers([tp, am])[0]?.provider).toBe("amadeus");
  });

  it("keeps genuinely different flights apart", () => {
    const morning = offer({
      id: "m",
      itineraries: [
        itinerary({ segments: [segment({ departureAt: "2026-10-15T07:00:00", flightNumber: "1" })] }),
      ],
    });
    const evening = offer({
      id: "e",
      itineraries: [
        itinerary({ segments: [segment({ departureAt: "2026-10-15T19:00:00", flightNumber: "2" })] }),
      ],
    });
    expect(dedupeOffers([morning, evening])).toHaveLength(2);
  });

  it("distinguishes a one-way from a round trip on the same outbound", () => {
    const oneWay = offer({ id: "ow" });
    const roundTrip = offer({
      id: "rt",
      itineraries: [
        itinerary({ direction: "outbound" }),
        itinerary({
          direction: "inbound",
          segments: [segment({ from: "NRT", to: "WAW", departureAt: "2026-10-29T10:00:00" })],
        }),
      ],
    });
    expect(dedupeOffers([oneWay, roundTrip])).toHaveLength(2);
  });

  it("falls back to times when a provider gives no routing", () => {
    const a = offer({
      id: "a",
      itineraries: [itinerary({ segments: [], departureAt: "2026-10-15T08:00:00", stops: 1 })],
    });
    const b = offer({
      id: "b",
      itineraries: [itinerary({ segments: [], departureAt: "2026-10-15T08:00:00", stops: 1 })],
    });
    expect(dedupeOffers([a, b])).toHaveLength(1);
  });
});
