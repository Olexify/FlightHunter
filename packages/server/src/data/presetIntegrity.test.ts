import { describe, expect, it } from "vitest";
import { ROUTE_PRESETS } from "@flighthunter/shared";
import { hasAirport, isMetroCode, metroMembers } from "./airports.js";

/**
 * Data-integrity guard.
 *
 * A preset that names an airport the dataset does not contain fails silently:
 * the orchestrator drops the code, no warning is emitted, and the user sees a
 * preset that claims to cover a city it never searches. That is exactly what
 * happened with BER — seven presets advertised Berlin while the shipped
 * OpenFlights snapshot had only the three now-closed Berlin airports.
 *
 * This test is the reason that cannot recur.
 */
describe("every built-in preset references real airports", () => {
  for (const preset of ROUTE_PRESETS) {
    it(`${preset.id} resolves all of its codes`, () => {
      const unknown = [...preset.origins, ...preset.destinations].filter(
        (code) => !hasAirport(code) && metroMembers(code).length === 0,
      );
      expect(unknown, `unknown codes in "${preset.label}"`).toEqual([]);
    });
  }

  it("covers every preset, so none is skipped by a typo in this file", () => {
    expect(ROUTE_PRESETS.length).toBeGreaterThan(15);
  });

  it("gives every preset at least one origin and one destination", () => {
    for (const p of ROUTE_PRESETS) {
      expect(p.origins.length, p.id).toBeGreaterThan(0);
      expect(p.destinations.length, p.id).toBeGreaterThan(0);
    }
  });

  it("never lists the same airport as both origin and destination", () => {
    for (const p of ROUTE_PRESETS) {
      const overlap = p.origins.filter((o) => p.destinations.includes(o));
      // A same-airport pair is skipped by the orchestrator, so a preset that
      // relies on one is quietly smaller than it looks.
      expect(overlap, `${p.id} lists ${overlap.join(",")} on both sides`).toEqual([]);
    }
  });
});

describe("every metro code resolves to real airports", () => {
  const CODES = ["NYC", "LON", "PAR", "TYO", "OSA", "MIL", "ROM", "STO", "WAS", "CHI", "MOW", "BJS", "SEL", "SHA", "SAO", "RIO", "BUE", "YTO", "YMQ", "BKK", "TSA"];

  for (const code of CODES) {
    it(`${code} has at least one member in the dataset`, () => {
      expect(isMetroCode(code)).toBe(true);
      expect(metroMembers(code).length).toBeGreaterThan(0);
    });
  }
});
