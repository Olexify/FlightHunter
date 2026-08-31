import { describe, expect, it } from "vitest";
import { TtlCache } from "./cache.js";

/** Controllable clock so TTL behaviour is tested without real waiting. */
function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("TtlCache", () => {
  it("stores and returns values", () => {
    const c = new TtlCache<string>(10, 1000);
    c.set("a", "hello");
    expect(c.get("a")).toBe("hello");
  });

  it("expires entries after the TTL", () => {
    const t = clock();
    const c = new TtlCache<string>(10, 1000, t.now);
    c.set("a", "hello");

    t.advance(999);
    expect(c.get("a")).toBe("hello");

    t.advance(2);
    expect(c.get("a")).toBeUndefined();
  });

  it("evicts the least-recently-USED entry, not the oldest inserted", () => {
    const c = new TtlCache<number>(3, 10_000);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);

    // Touch "a" so "b" becomes the least recently used.
    expect(c.get("a")).toBe(1);
    c.set("d", 4);

    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.get("d")).toBe(4);
  });

  it("never exceeds maxEntries", () => {
    const c = new TtlCache<number>(5, 10_000);
    for (let i = 0; i < 100; i++) c.set(`k${i}`, i);
    expect(c.stats().size).toBe(5);
    expect(c.stats().evictions).toBe(95);
  });

  it("prunes expired entries without being read", () => {
    const t = clock();
    const c = new TtlCache<number>(100, 1000, t.now);
    c.set("a", 1);
    c.set("b", 2);

    t.advance(1500);
    expect(c.prune()).toBe(2);
    expect(c.stats().size).toBe(0);
  });

  it("treats a zero TTL as caching disabled", () => {
    const c = new TtlCache<number>(10, 0);
    c.set("a", 1);
    expect(c.get("a")).toBeUndefined();
  });

  it("tracks hits and misses", () => {
    const c = new TtlCache<number>(10, 1000);
    c.set("a", 1);
    c.get("a");
    c.get("missing");
    expect(c.stats().hits).toBe(1);
    expect(c.stats().misses).toBe(1);
  });
});
