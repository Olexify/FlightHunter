import { describe, expect, it } from "vitest";
import { evaluateAlert } from "./alertPoller.js";

const base = {
  targetPrice: null as number | null,
  dropPercent: null as number | null,
  baselinePrice: null as number | null,
  currency: "EUR",
};

describe("evaluateAlert", () => {
  it("fires when the price reaches the target", () => {
    const r = evaluateAlert({ ...base, price: 480, targetPrice: 500 });
    expect(r.triggered).toBe(true);
    expect(r.message).toContain("target");
  });

  it("fires exactly at the target, not only below it", () => {
    expect(evaluateAlert({ ...base, price: 500, targetPrice: 500 }).triggered).toBe(true);
  });

  it("stays quiet above the target", () => {
    expect(evaluateAlert({ ...base, price: 520, targetPrice: 500 }).triggered).toBe(false);
  });

  it("fires on a percentage drop from the baseline", () => {
    const r = evaluateAlert({ ...base, price: 800, dropPercent: 15, baselinePrice: 1000 });
    expect(r.triggered).toBe(true);
    expect(r.message).toContain("20.0%");
  });

  it("does not fire on a drop smaller than the threshold", () => {
    expect(
      evaluateAlert({ ...base, price: 950, dropPercent: 15, baselinePrice: 1000 }).triggered,
    ).toBe(false);
  });

  it("cannot fire on a percentage rule with no baseline yet", () => {
    expect(
      evaluateAlert({ ...base, price: 100, dropPercent: 15, baselinePrice: null }).triggered,
    ).toBe(false);
  });

  it("does not divide by a zero baseline", () => {
    expect(
      evaluateAlert({ ...base, price: 100, dropPercent: 15, baselinePrice: 0 }).triggered,
    ).toBe(false);
  });

  it("fires if either rule is satisfied", () => {
    const r = evaluateAlert({
      ...base,
      price: 400,
      targetPrice: 450,
      dropPercent: 90,
      baselinePrice: 500,
    });
    expect(r.triggered).toBe(true);
  });

  it("stays quiet when no rule is configured", () => {
    expect(evaluateAlert({ ...base, price: 1 }).triggered).toBe(false);
  });
});
