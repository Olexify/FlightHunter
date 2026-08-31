import { describe, expect, it } from "vitest";
import { SearchRequest } from "@flighthunter/shared";
import { MockProvider } from "./mock.js";

const provider = new MockProvider();

const req = (over: Record<string, unknown> = {}) =>
  SearchRequest.parse({
    origins: ["WAW"],
    destinations: ["NRT"],
    departureDate: "2026-10-15",
    ...over,
  });

const search = (pair: { origin: string; destination: string; departureDate: string; returnDate?: string }, over = {}) =>
  provider.search(pair, req(over), {});

describe("MockProvider", () => {
  it("is always available so the app works without keys", () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it("returns offers for a real route", async () => {
    const offers = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]?.provider).toBe("mock");
  });

  it("is deterministic — the same query gives the same fares", async () => {
    const a = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    const b = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    expect(a.map((o) => o.price.total)).toEqual(b.map((o) => o.price.total));
  });

  it("returns nothing for an unknown airport instead of throwing", async () => {
    expect(await search({ origin: "ZZZ", destination: "NRT", departureDate: "2026-10-15" })).toEqual([]);
  });

  it("builds a second itinerary for a round trip", async () => {
    const offers = await search({
      origin: "WAW",
      destination: "NRT",
      departureDate: "2026-10-15",
      returnDate: "2026-10-29",
    });

    const withReturn = offers[0];
    expect(withReturn?.itineraries).toHaveLength(2);
    expect(withReturn?.itineraries[1]?.direction).toBe("inbound");
    // The inbound leg flies back the other way.
    expect(withReturn?.itineraries[1]?.segments[0]?.from).toBe("NRT");
  });

  it("prices a round trip above the equivalent one-way", async () => {
    const oneWay = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    const roundTrip = await search({
      origin: "WAW",
      destination: "NRT",
      departureDate: "2026-10-15",
      returnDate: "2026-10-29",
    });
    const cheapest = (list: Array<{ price: { total: number } }>) =>
      Math.min(...list.map((o) => o.price.total));

    expect(cheapest(roundTrip)).toBeGreaterThan(cheapest(oneWay));
  });

  it("prices business class above economy", async () => {
    const eco = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    const biz = await search(
      { origin: "WAW", destination: "NRT", departureDate: "2026-10-15" },
      { cabin: "BUSINESS" },
    );
    expect(Math.min(...biz.map((o) => o.price.total))).toBeGreaterThan(
      Math.min(...eco.map((o) => o.price.total)),
    );
  });

  it("never connects through the origin or the destination", async () => {
    // LOT's hub is WAW, which previously produced "WAW → KIX via WAW" with a
    // zero-length first segment.
    const routes: Array<[string, string]> = [
      ["WAW", "KIX"],
      ["WAW", "NRT"],
      ["IST", "NRT"],
      ["FRA", "HND"],
      ["AMS", "KIX"],
    ];

    for (const [origin, destination] of routes) {
      const offers = await search({ origin, destination, departureDate: "2026-10-15" });
      for (const offer of offers) {
        for (const itin of offer.itineraries) {
          for (const seg of itin.segments) {
            expect(seg.from).not.toBe(seg.to);
          }
          const vias = itin.segments.slice(0, -1).map((s) => s.to);
          expect(vias).not.toContain(offer.origin);
          expect(vias).not.toContain(offer.destination);
        }
      }
    }
  });

  it("reports a stop count matching the actual segments", async () => {
    const offers = await search({ origin: "WAW", destination: "NRT", departureDate: "2026-10-15" });
    for (const o of offers) {
      for (const itin of o.itineraries) {
        expect(itin.stops).toBe(itin.segments.length - 1);
      }
    }
  });

  it("charges more for a last-minute departure than one months out", async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const later = new Date();
    later.setDate(later.getDate() + 75);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const lastMinute = await search({ origin: "WAW", destination: "NRT", departureDate: iso(soon) });
    const advance = await search({ origin: "WAW", destination: "NRT", departureDate: iso(later) });

    expect(Math.min(...lastMinute.map((o) => o.price.total))).toBeGreaterThan(
      Math.min(...advance.map((o) => o.price.total)),
    );
  });
});
