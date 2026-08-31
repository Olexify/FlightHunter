import { describe, expect, it } from "vitest";
import { scoreOffers, sortOffers } from "./rank.js";
import { itinerary, offer, segment } from "../testFixtures.js";

const make = (id: string, price: number, minutes: number, stops: number) =>
  offer({
    id,
    price: { total: price, currency: "EUR" },
    totalDurationMinutes: minutes,
    maxStops: stops,
    itineraries: [
      itinerary({
        durationMinutes: minutes,
        stops,
        segments: [segment({ departureAt: `2026-10-15T${String(6 + stops).padStart(2, "0")}:00:00` })],
      }),
    ],
  });

describe("scoreOffers", () => {
  it("gives the best score to the cheapest, fastest, most direct option", () => {
    const best = make("best", 400, 700, 0);
    const worst = make("worst", 900, 1600, 2);
    scoreOffers([best, worst]);

    expect(best.score).toBeGreaterThan(worst.score ?? 0);
    expect(best.score).toBe(100);
    expect(worst.score).toBe(0);
  });

  it("ranks a slightly dearer nonstop above a slow cheap double-connection", () => {
    // 12% dearer, but 22 hours and two connections shorter.
    const cheapSlow = make("cheap", 500, 2000, 2);
    const dearFast = make("fast", 560, 700, 0);
    scoreOffers([cheapSlow, dearFast]);

    expect(dearFast.score).toBeGreaterThan(cheapSlow.score ?? 0);
  });

  it("still prefers the cheap option when the price gap is large", () => {
    // Tripling the fare is not worth saving a connection.
    const cheapSlow = make("cheap", 500, 900, 1);
    const veryDearFast = make("dear", 1500, 700, 0);
    scoreOffers([cheapSlow, veryDearFast]);

    expect(cheapSlow.score).toBeGreaterThan(veryDearFast.score ?? 0);
  });

  it("scores magnitude, not just ordering", () => {
    // The same ordering with a tiny gap must not be penalised as heavily as
    // one with a huge gap — the flaw that min-max normalisation hid.
    const [a1, a2] = [make("a1", 500, 700, 0), make("a2", 510, 700, 0)];
    scoreOffers([a1, a2]);
    const smallGap = (a1.score ?? 0) - (a2.score ?? 0);

    const [b1, b2] = [make("b1", 500, 700, 0), make("b2", 1500, 700, 0)];
    scoreOffers([b1, b2]);
    const largeGap = (b1.score ?? 0) - (b2.score ?? 0);

    expect(largeGap).toBeGreaterThan(smallGap * 5);
  });

  it("handles a single offer without dividing by zero", () => {
    const only = make("only", 500, 700, 0);
    scoreOffers([only]);
    expect(Number.isFinite(only.score)).toBe(true);
  });

  it("tolerates an empty set", () => {
    expect(() => scoreOffers([])).not.toThrow();
  });
});

describe("sortOffers", () => {
  const build = () => [make("c", 700, 800, 1), make("a", 400, 1500, 2), make("b", 550, 600, 0)];

  it("sorts by price", () => {
    expect(sortOffers(build(), "price").map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by duration", () => {
    expect(sortOffers(build(), "duration").map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by stops", () => {
    expect(sortOffers(build(), "stops").map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("is stable and total for equal keys", () => {
    // Identical on every sort dimension except id: ordering must be deterministic.
    const tied = [make("z", 500, 700, 0), make("y", 500, 700, 0), make("x", 500, 700, 0)];
    const once = sortOffers([...tied], "price").map((o) => o.id);
    const twice = sortOffers([...tied].reverse(), "price").map((o) => o.id);
    expect(once).toEqual(twice);
    expect(once).toEqual(["x", "y", "z"]);
  });

  it("falls back to price when scores tie under 'best'", () => {
    const offers = build();
    scoreOffers(offers);
    const sorted = sortOffers(offers, "best");
    expect(sorted[0]?.score).toBeGreaterThanOrEqual(sorted[1]?.score ?? 0);
  });
});

describe("custom ranking weights", () => {
  it("a price-only weighting ranks strictly by price", () => {
    const cheapSlow = make("cheap", 500, 2400, 2);
    const dearFast = make("fast", 560, 700, 0);
    scoreOffers([cheapSlow, dearFast], { price: 1, duration: 0, stops: 0 });

    expect(cheapSlow.score).toBeGreaterThan(dearFast.score ?? 0);
  });

  it("a duration-only weighting ranks strictly by time", () => {
    const cheapSlow = make("cheap", 500, 2400, 2);
    const dearFast = make("fast", 560, 700, 0);
    scoreOffers([cheapSlow, dearFast], { price: 0, duration: 1, stops: 0 });

    expect(dearFast.score).toBeGreaterThan(cheapSlow.score ?? 0);
  });

  it("a heavy stop penalty demotes connections", () => {
    const direct = make("direct", 600, 800, 0);
    const twoStop = make("two", 590, 800, 2);
    scoreOffers([direct, twoStop], { price: 0.6, duration: 0.4, stops: 0.4 });

    expect(direct.score).toBeGreaterThan(twoStop.score ?? 0);
  });
});
