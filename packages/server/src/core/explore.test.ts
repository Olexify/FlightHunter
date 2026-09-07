import { beforeEach, describe, expect, it } from "vitest";
import { ExploreRequest, regionOf } from "@flighthunter/shared";
import { runExplore } from "./explore.js";
import { clearSearchCache } from "./orchestrator.js";

const req = (over: Record<string, unknown> = {}) =>
  ExploreRequest.parse({
    origins: ["WAW"],
    departureDate: "2026-11-20",
    candidates: 12,
    ...over,
  });

beforeEach(() => clearSearchCache());

describe("regionOf", () => {
  it("derives a region from an IANA zone", () => {
    expect(regionOf("Asia/Tokyo")).toBe("Asia");
    expect(regionOf("Europe/Warsaw")).toBe("Europe");
    expect(regionOf("America/New_York")).toBe("America");
  });

  it("returns null for a zone outside the known set", () => {
    expect(regionOf("UTC")).toBeNull();
    expect(regionOf("Antarctica/Casey")).toBeNull();
  });
});

describe("runExplore", () => {
  it("returns destinations, cheapest first", async () => {
    const res = await runExplore(req());

    expect(res.results.length).toBeGreaterThan(0);
    const prices = res.results.map((r) => r.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("never returns the origin as a destination", async () => {
    const res = await runExplore(req({ origins: ["WAW"] }));
    expect(res.results.every((r) => r.destination.iata !== "WAW")).toBe(true);
  });

  it("returns one row per destination, not one per fare", async () => {
    const res = await runExplore(req());
    const codes = res.results.map((r) => r.destination.iata);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("respects a budget ceiling", async () => {
    const res = await runExplore(req({ maxPrice: 300 }));
    expect(res.results.every((r) => r.price <= 300)).toBe(true);
  });

  it("restricts to the requested regions", async () => {
    const res = await runExplore(req({ regions: ["Asia"], candidates: 15 }));
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => r.region === "Asia")).toBe(true);
  });

  it("honours a minimum distance, excluding near neighbours", async () => {
    const res = await runExplore(req({ minDistanceKm: 5000, candidates: 15 }));
    expect(res.results.every((r) => r.distanceKm >= 4000)).toBe(true);
  });

  it("caps results at the requested limit", async () => {
    const res = await runExplore(req({ candidates: 20, limit: 3 }));
    expect(res.results.length).toBeLessThanOrEqual(3);
  });

  it("sorts by distance when asked", async () => {
    const res = await runExplore(req({ sort: "distance" }));
    const km = res.results.map((r) => r.distanceKm);
    expect(km).toEqual([...km].sort((a, b) => a - b));
  });

  it("adds a return date for a round trip", async () => {
    const res = await runExplore(req({ tripLengthDays: 10 }));
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => r.returnDate !== undefined)).toBe(true);
    expect(res.results[0]?.returnDate).toBe("2026-11-30");
  });

  it("explains an empty result set instead of returning a bare list", async () => {
    // Warsaw's furthest reachable airports are around 18,000 km, so a 19,000 km
    // floor matches nothing. (A floor that also exceeded a flight-time ceiling
    // would be rejected by validation instead — see the next test.)
    const res = await runExplore(req({ minDistanceKm: 19000 }));
    expect(res.results).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("rejects a request whose distance floor exceeds its flight-time ceiling", () => {
    const parsed = ExploreRequest.safeParse({
      origins: ["WAW"],
      departureDate: "2026-11-20",
      minDistanceKm: 15000,
      maxFlightHours: 3,
    });
    expect(parsed.success).toBe(false);
  });

  it("throws when no origin is recognised", async () => {
    await expect(runExplore(req({ origins: ["ZZZ"] }))).rejects.toThrow();
  });
});
