import { describe, expect, it } from "vitest";
import {
  airportCount,
  distanceBetween,
  expandMetroCodes,
  getAirport,
  metroMembers,
  nearbyAirports,
  partitionKnown,
  searchAirports,
} from "./airports.js";

describe("dataset", () => {
  it("loads the worldwide airport list", () => {
    expect(airportCount()).toBeGreaterThan(5000);
  });

  it("resolves a known airport with a real timezone", () => {
    const waw = getAirport("WAW");
    expect(waw?.city).toBe("Warsaw");
    expect(waw?.tz).toBe("Europe/Warsaw");
  });

  it("backfills timezones that are missing upstream", () => {
    // Istanbul's new airport has a null timezone in the source data.
    expect(getAirport("IST")?.tz).toBe("Europe/Istanbul");
  });

  it("is case insensitive", () => {
    expect(getAirport("waw")?.iata).toBe("WAW");
  });
});

describe("searchAirports ranking", () => {
  const codes = (q: string, n = 5) => searchAirports(q, n).map((a) => a.iata);

  it("ranks the major hub above a tiny exact-name match", () => {
    // "Tok" is Tok Junction, Alaska (2 routes). Nobody means that.
    const top = codes("tok", 3);
    expect(top[0]).toBe("NRT");
    expect(top).toContain("HND");
  });

  it("orders same-city airports by hub size", () => {
    expect(codes("london", 2)[0]).toBe("LHR");
  });

  it("prefers a busy city over a dormant exact code match", () => {
    // "WAR" is a real but route-less IATA code; Warsaw is what was meant.
    expect(codes("war", 2)[0]).toBe("WAW");
  });

  it("finds airports by IATA code", () => {
    expect(codes("kix", 1)[0]).toBe("KIX");
  });

  it("respects the result limit", () => {
    expect(searchAirports("a", 3)).toHaveLength(3);
  });

  it("returns something for an empty query instead of throwing", () => {
    expect(searchAirports("", 5).length).toBe(5);
  });

  it("returns nothing for gibberish", () => {
    expect(searchAirports("zzzzqqqq", 5)).toHaveLength(0);
  });
});

describe("metro codes", () => {
  it("resolves NYC to its member airports", () => {
    const nyc = searchAirports("nyc", 5).map((a) => a.iata);
    expect(nyc).toContain("JFK");
    expect(nyc).toContain("EWR");
    expect(nyc).toContain("LGA");
  });

  it("resolves TYO to the Tokyo airports", () => {
    expect(metroMembers("TYO").map((a) => a.iata).sort()).toEqual(["HND", "NRT"]);
  });

  it("expands metro codes for a search", () => {
    const { codes, expanded } = expandMetroCodes(["NYC", "WAW"]);
    expect(codes).toContain("JFK");
    expect(codes).toContain("WAW");
    expect(expanded).toContain("JFK");
    expect(codes).not.toContain("NYC");
  });

  it("leaves a real airport code that doubles as a metro code alone", () => {
    // BKK is both a city code and Suvarnabhumi itself; it must stay searchable.
    const { codes } = expandMetroCodes(["BKK"]);
    expect(codes).toEqual(["BKK"]);
  });

  it("does not duplicate codes", () => {
    const { codes } = expandMetroCodes(["WAW", "WAW"]);
    expect(codes).toEqual(["WAW"]);
  });
});

describe("partitionKnown", () => {
  it("separates real codes from junk", () => {
    const { known, unknown } = partitionKnown(["WAW", "ZZZ", "nrt"]);
    expect(known).toContain("WAW");
    expect(known).toContain("NRT");
    expect(unknown).toContain("ZZZ");
  });
});

describe("geography", () => {
  it("finds nearby airports", () => {
    const near = nearbyAirports("WAW", 300).map((a) => a.iata);
    expect(near).toContain("WMI");
    expect(near).not.toContain("WAW");
  });

  it("returns nothing for a zero radius", () => {
    expect(nearbyAirports("WAW", 0)).toHaveLength(0);
  });

  it("measures a plausible great-circle distance", () => {
    // Warsaw to Tokyo Narita is roughly 8,600 km.
    const d = distanceBetween("WAW", "NRT");
    expect(d).toBeGreaterThan(8000);
    expect(d).toBeLessThan(9500);
  });

  it("returns null for an unknown airport", () => {
    expect(distanceBetween("WAW", "ZZZ")).toBeNull();
  });
});
