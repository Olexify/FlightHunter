import { describe, expect, it } from "vitest";
import { co2AsCarKm, co2Rating, estimateCo2Kg } from "./carbon.js";

describe("estimateCo2Kg", () => {
  it("scales with distance", () => {
    const short = estimateCo2Kg(500);
    const long = estimateCo2Kg(9000);
    expect(long).toBeGreaterThan(short);
  });

  it("uses a lower per-km rate for long haul", () => {
    // Emissions per passenger-kilometre fall with distance, so ten times the
    // distance must cost less than ten times the emissions.
    const perKmShort = estimateCo2Kg(600) / 600;
    const perKmLong = estimateCo2Kg(9000) / 9000;
    expect(perKmLong).toBeLessThan(perKmShort);
  });

  it("produces a plausible figure for a real long-haul route", () => {
    // Warsaw to Tokyo is ~8,600 km; published economy estimates sit near 1 t.
    const kg = estimateCo2Kg(8600);
    expect(kg).toBeGreaterThan(700);
    expect(kg).toBeLessThan(1400);
  });

  it("charges premium cabins more", () => {
    const economy = estimateCo2Kg(8000, "ECONOMY");
    const business = estimateCo2Kg(8000, "BUSINESS");
    expect(business).toBeGreaterThan(economy * 2);
  });

  it("returns 0 for nonsense input rather than NaN", () => {
    expect(estimateCo2Kg(0)).toBe(0);
    expect(estimateCo2Kg(-100)).toBe(0);
    expect(estimateCo2Kg(Number.NaN)).toBe(0);
  });

  it("falls back to the economy factor for an unknown cabin", () => {
    expect(estimateCo2Kg(5000, "SPACE")).toBe(estimateCo2Kg(5000, "ECONOMY"));
  });
});

describe("co2AsCarKm", () => {
  it("converts to a comparable car distance", () => {
    expect(co2AsCarKm(170)).toBe(1000);
  });
});

describe("co2Rating", () => {
  it("rates a direct flight as low", () => {
    const direct = estimateCo2Kg(8000);
    expect(co2Rating(direct, 8000)).toBe("low");
  });

  it("rates a big detour as high", () => {
    const viaDetour = estimateCo2Kg(12000);
    expect(co2Rating(viaDetour, 8000)).toBe("high");
  });

  it("does not brand every long-haul flight as bad", () => {
    // A nonstop 12,000 km flight is compared against a 12,000 km baseline.
    expect(co2Rating(estimateCo2Kg(12000), 12000)).toBe("low");
  });
});
