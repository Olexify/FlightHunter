import { describe, expect, it } from "vitest";
import { offersToCsv } from "./csv.js";
import { itinerary, offer, segment } from "../testFixtures.js";

describe("offersToCsv", () => {
  it("emits a header even with no rows", () => {
    const csv = offersToCsv([]);
    expect(csv).toContain("origin,destination,price");
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });

  it("writes one row per offer", () => {
    const csv = offersToCsv([offer({ id: "a" }), offer({ id: "b" })]);
    expect(csv.trim().split("\r\n")).toHaveLength(3);
  });

  it("quotes and escapes values containing commas or quotes", () => {
    const csv = offersToCsv([
      offer({ airlines: [{ code: "TK", name: 'Turkish, "the" Airline' }] }),
    ]);
    expect(csv).toContain('"Turkish, ""the"" Airline"');
  });

  it("includes both legs of a round trip", () => {
    const csv = offersToCsv([
      offer({
        itineraries: [
          itinerary({ direction: "outbound" }),
          itinerary({
            direction: "inbound",
            segments: [segment({ from: "NRT", to: "WAW", departureAt: "2026-10-29T09:00:00" })],
          }),
        ],
      }),
    ]);
    expect(csv).toContain("2026-10-29T09:00:00");
  });

  it("renders the routing as a readable path", () => {
    const csv = offersToCsv([
      offer({
        itineraries: [
          itinerary({
            segments: [segment({ from: "WAW", to: "IST" }), segment({ from: "IST", to: "NRT" })],
          }),
        ],
      }),
    ]);
    expect(csv).toContain("WAW>IST>NRT");
  });

  it("starts with a BOM so Excel reads UTF-8 correctly", () => {
    expect(offersToCsv([]).charCodeAt(0)).toBe(0xfeff);
  });
});
