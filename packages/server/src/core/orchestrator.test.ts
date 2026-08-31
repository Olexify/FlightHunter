import { beforeEach, describe, expect, it } from "vitest";
import { SearchRequest } from "@flighthunter/shared";
import { clearSearchCache, runSearch } from "./orchestrator.js";

const req = (over: Record<string, unknown> = {}) =>
  SearchRequest.parse({
    origins: ["WAW"],
    destinations: ["NRT"],
    departureDate: "2026-10-15",
    ...over,
  });

beforeEach(() => clearSearchCache());

describe("runSearch", () => {
  it("returns offers ranked by the composite score under the default sort", async () => {
    const res = await runSearch(req());
    expect(res.offers.length).toBeGreaterThan(0);
    expect(res.offers[0]?.score).toBeDefined();

    // The default sort is "best" — score descending, NOT price ascending.
    const scores = res.offers.map((o) => o.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("sorts by price when asked", async () => {
    const res = await runSearch(req({ sort: "price" }));
    const prices = res.offers.map((o) => o.price.total);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("sorts by duration when asked", async () => {
    const res = await runSearch(req({ sort: "duration" }));
    const mins = res.offers.map((o) => o.totalDurationMinutes);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });

  it("searches every origin-destination combination", async () => {
    const res = await runSearch(req({ origins: ["WAW", "IST"], destinations: ["NRT", "KIX"] }));
    const routes = new Set(res.offers.map((o) => `${o.origin}-${o.destination}`));
    expect(routes.size).toBe(4);
  });

  it("skips a pair where origin equals destination", async () => {
    const res = await runSearch(req({ origins: ["WAW", "NRT"], destinations: ["NRT"] }));
    expect(res.offers.every((o) => o.origin !== o.destination)).toBe(true);
  });

  /**
   * The old cache key omitted passenger counts, so a 1-adult search served its
   * prices to a later 4-adult search for the whole TTL.
   */
  it("does not serve a 1-adult result to a 2-adult search", async () => {
    const one = await runSearch(req({ adults: 1 }));
    const two = await runSearch(req({ adults: 2 }));

    const cheapest = (r: Awaited<ReturnType<typeof runSearch>>) =>
      Math.min(...r.offers.map((o) => o.price.total));

    expect(cheapest(two)).toBeGreaterThan(cheapest(one));
  });

  it("does not serve an economy result to a business search", async () => {
    const eco = await runSearch(req({ cabin: "ECONOMY" }));
    const biz = await runSearch(req({ cabin: "BUSINESS" }));

    const cheapest = (r: Awaited<ReturnType<typeof runSearch>>) =>
      Math.min(...r.offers.map((o) => o.price.total));

    expect(cheapest(biz)).toBeGreaterThan(cheapest(eco));
  });

  it("reports a cache hit on an identical repeat search", async () => {
    const first = await runSearch(req());
    expect(first.cached).toBe(false);

    const second = await runSearch(req());
    expect(second.cached).toBe(true);
    expect(second.providers[0]?.cacheHits).toBeGreaterThan(0);
    // Cached offers still count toward the provider's contribution.
    expect(second.providers[0]?.offers).toBeGreaterThan(0);
  });

  it("warns about unknown airport codes instead of failing silently", async () => {
    const res = await runSearch(req({ origins: ["WAW", "ZZZ"] }));
    expect(res.warnings.some((w) => w.includes("ZZZ"))).toBe(true);
    expect(res.offers.length).toBeGreaterThan(0);
  });

  it("rejects a search with no recognisable airports", async () => {
    await expect(runSearch(req({ origins: ["ZZZ"], destinations: ["QQQ"] }))).rejects.toThrow();
  });

  it("expands metro codes into real airports", async () => {
    const res = await runSearch(req({ origins: ["NYC"], destinations: ["NRT"] }));
    const origins = new Set(res.offers.map((o) => o.origin));
    expect(origins.has("JFK")).toBe(true);
    expect(origins.has("NYC")).toBe(false);
  });

  it("adds nearby origins when asked", async () => {
    const res = await runSearch(req({ nearbyRadiusKm: 300 }));
    expect(res.expandedOrigins.length).toBeGreaterThan(0);
    expect(res.offers.some((o) => o.origin !== "WAW")).toBe(true);
  });

  /**
   * Flexible dates must inform the price grid WITHOUT smuggling flights on
   * unrequested dates into the result list.
   */
  it("keeps flex-date results out of the offer list", async () => {
    const res = await runSearch(req({ flexDays: 2 }));

    const dates = new Set(
      res.offers.map((o) => {
        const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
        return out?.departureAt.slice(0, 10);
      }),
    );

    expect([...dates]).toEqual(["2026-10-15"]);
    expect(res.priceGrid.length).toBeGreaterThan(1);
    expect(res.priceGrid.map((c) => c.departureDate)).toContain("2026-10-13");
  });

  it("applies filters and reports what they removed", async () => {
    const all = await runSearch(req());
    const direct = await runSearch(req({ maxStops: 0 }));

    expect(direct.offers.every((o) => o.maxStops === 0)).toBe(true);
    expect(direct.totalBeforeFilters).toBeGreaterThanOrEqual(direct.offers.length);
    expect(all.offers.length).toBeGreaterThanOrEqual(direct.offers.length);
  });

  it("notes that results are sample data when no keys are set", async () => {
    const res = await runSearch(req());
    expect(res.warnings.some((w) => w.toLowerCase().includes("sample"))).toBe(true);
  });
});
