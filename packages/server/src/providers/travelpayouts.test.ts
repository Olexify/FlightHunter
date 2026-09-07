import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchRequest } from "@flighthunter/shared";
import { TravelpayoutsProvider } from "./travelpayouts.js";

const provider = new TravelpayoutsProvider();

const req = SearchRequest.parse({
  origins: ["WAW"],
  destinations: ["NRT"],
  departureDate: "2026-10-15",
  currency: "EUR",
});

/** Stub the platform fetch with one canned Travelpayouts payload. */
function stubFetch(rows: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: rows }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TravelpayoutsProvider normalisation", () => {
  it("derives arrival from departure + duration, NOT from return_at", async () => {
    // `return_at` is when the RETURN flight departs. The previous version used
    // it as the outbound arrival time, so every arrival was wrong.
    stubFetch([
      {
        price: 620,
        airline: "TK",
        departure_at: "2026-10-15T10:00:00+02:00",
        return_at: "2026-10-29T14:00:00+09:00",
        transfers: 1,
        return_transfers: 0,
        duration_to: 900, // 15h
        duration_back: 800,
      },
    ]);

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15", returnDate: "2026-10-29" },
      req,
      {},
    );

    const outbound = offer?.itineraries.find((i) => i.direction === "outbound");
    expect(outbound?.departureAt).toBe("2026-10-15T10:00:00");
    // 08:00Z + 15h = 23:00Z -> 08:00 next day in Tokyo (UTC+9).
    expect(outbound?.arrivalAt).toBe("2026-10-16T08:00:00");
    expect(outbound?.arrivalAt).not.toContain("2026-10-29");
    expect(outbound?.durationMinutes).toBe(900);
  });

  it("maps the return leg as its own inbound itinerary", async () => {
    stubFetch([
      {
        price: 620,
        airline: "TK",
        departure_at: "2026-10-15T10:00:00+02:00",
        return_at: "2026-10-29T14:00:00+09:00",
        transfers: 1,
        return_transfers: 2,
        duration_to: 900,
        duration_back: 800,
      },
    ]);

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15", returnDate: "2026-10-29" },
      req,
      {},
    );

    expect(offer?.itineraries).toHaveLength(2);
    const inbound = offer?.itineraries.find((i) => i.direction === "inbound");
    expect(inbound?.departureAt).toBe("2026-10-29T14:00:00");
    expect(inbound?.stops).toBe(2);
    // maxStops must reflect the WORST leg, not just the outbound.
    expect(offer?.maxStops).toBe(2);
    expect(offer?.totalDurationMinutes).toBe(1700);
  });

  it("produces a one-way offer when there is no return", async () => {
    stubFetch([
      {
        price: 400,
        airline: "LO",
        departure_at: "2026-10-15T10:00:00+02:00",
        transfers: 0,
        duration_to: 700,
      },
    ]);

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      req,
      {},
    );

    expect(offer?.itineraries).toHaveLength(1);
    expect(offer?.maxStops).toBe(0);
  });

  it("keeps the airline code usable for filtering", async () => {
    stubFetch([
      { price: 400, airline: "lo", departure_at: "2026-10-15T10:00:00+02:00", duration_to: 700 },
    ]);

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      req,
      {},
    );
    expect(offer?.airlines[0]?.code).toBe("LO");
  });

  it("skips rows with no price or departure instead of emitting NaN", async () => {
    stubFetch([
      { airline: "TK", departure_at: "2026-10-15T10:00:00+02:00" },
      { price: 400, airline: "LO" },
      { price: 500, airline: "LH", departure_at: "2026-10-15T12:00:00+02:00", duration_to: 700 },
    ]);

    const offers = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      req,
      {},
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.price.total).toBe(500);
  });

  it("throws when the API reports failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: "bad token" }), { status: 200 }),
      ),
    );

    await expect(
      provider.search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" }, req, {}),
    ).rejects.toThrow("bad token");
  });
});

describe("passenger scaling", () => {
  it("scales the single-adult fare to the size of the party", async () => {
    // This endpoint takes no passenger count, so every fare it returns is for
    // one adult. Publishing it unchanged understated a family of four by 4x
    // and made Travelpayouts look cheapest on every multi-passenger search.
    stubFetch([
      { price: 400, airline: "LO", departure_at: "2026-10-15T10:00:00+02:00", duration_to: 700 },
    ]);

    const family = SearchRequest.parse({
      origins: ["WAW"],
      destinations: ["NRT"],
      departureDate: "2026-10-15",
      adults: 2,
      children: 2,
    });

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      family,
      {},
    );

    expect(offer?.price.total).toBe(1600);
    expect(offer?.warnings?.some((w) => w.includes("4 passengers"))).toBe(true);
  });

  it("leaves a single-adult fare untouched", async () => {
    stubFetch([
      { price: 400, airline: "LO", departure_at: "2026-10-15T10:00:00+02:00", duration_to: 700 },
    ]);

    const [offer] = await provider.search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      req,
      {},
    );
    expect(offer?.price.total).toBe(400);
  });
});
