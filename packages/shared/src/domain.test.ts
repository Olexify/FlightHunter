import { describe, expect, it } from "vitest";
import { IsoDate, SearchRequest } from "./domain.js";

const base = {
  origins: ["WAW"],
  destinations: ["NRT"],
  departureDate: "2026-10-15",
};

describe("IsoDate", () => {
  it("accepts a real date", () => {
    expect(IsoDate.safeParse("2026-10-15").success).toBe(true);
  });

  it("rejects a date that does not exist", () => {
    // A plain regex would let these through, and `new Date()` would silently
    // roll 2026-02-30 over into March.
    expect(IsoDate.safeParse("2026-02-30").success).toBe(false);
    expect(IsoDate.safeParse("2026-13-01").success).toBe(false);
  });

  it("accepts a leap day only in a leap year", () => {
    expect(IsoDate.safeParse("2028-02-29").success).toBe(true);
    expect(IsoDate.safeParse("2027-02-29").success).toBe(false);
  });

  it("rejects the wrong format", () => {
    expect(IsoDate.safeParse("15/10/2026").success).toBe(false);
  });
});

describe("SearchRequest", () => {
  it("applies defaults", () => {
    const r = SearchRequest.parse(base);
    expect(r.adults).toBe(1);
    expect(r.currency).toBe("EUR");
    expect(r.cabin).toBe("ECONOMY");
    expect(r.sort).toBe("best");
    expect(r.flexDays).toBe(0);
  });

  it("upper-cases airport and currency codes", () => {
    const r = SearchRequest.parse({ ...base, origins: ["waw"], currency: "eur" });
    expect(r.origins).toEqual(["WAW"]);
    expect(r.currency).toBe("EUR");
  });

  it("rejects a return date before departure", () => {
    const r = SearchRequest.safeParse({ ...base, returnDate: "2026-10-01" });
    expect(r.success).toBe(false);
  });

  it("accepts a same-day return", () => {
    expect(SearchRequest.safeParse({ ...base, returnDate: "2026-10-15" }).success).toBe(true);
  });

  it("rejects more infants than adults", () => {
    expect(SearchRequest.safeParse({ ...base, adults: 1, infants: 2 }).success).toBe(false);
  });

  it("rejects an airline that is both included and excluded", () => {
    const r = SearchRequest.safeParse({
      ...base,
      includeAirlines: ["TK"],
      excludeAirlines: ["TK"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a minimum layover greater than the maximum", () => {
    const r = SearchRequest.safeParse({ ...base, minLayoverMinutes: 300, maxLayoverMinutes: 60 });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed IATA code", () => {
    expect(SearchRequest.safeParse({ ...base, origins: ["WARSAW"] }).success).toBe(false);
    expect(SearchRequest.safeParse({ ...base, origins: [] }).success).toBe(false);
  });

  it("validates time-of-day windows", () => {
    expect(SearchRequest.safeParse({ ...base, departAfter: "09:30" }).success).toBe(true);
    expect(SearchRequest.safeParse({ ...base, departAfter: "25:00" }).success).toBe(false);
    expect(SearchRequest.safeParse({ ...base, departAfter: "9:30" }).success).toBe(false);
  });
});
