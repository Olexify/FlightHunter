import { describe, expect, it } from "vitest";
import { createLimiter } from "./semaphore.js";

const defer = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createLimiter", () => {
  it("never exceeds the configured concurrency", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await defer(5);
          active--;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(active).toBe(0);
  });

  it("runs every queued task", async () => {
    const limit = createLimiter(2);
    const done: number[] = [];

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        limit(async () => {
          await defer(1);
          done.push(i);
        }),
      ),
    );

    expect(done).toHaveLength(10);
  });

  it("releases its slot when a task rejects", async () => {
    const limit = createLimiter(1);

    await expect(limit(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // A leaked permit would make this hang forever rather than resolve.
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });

  it("releases its slot when a task throws synchronously", async () => {
    const limit = createLimiter(1);

    await expect(
      limit((() => {
        throw new Error("sync boom");
      }) as () => Promise<never>),
    ).rejects.toThrow("sync boom");

    await expect(limit(async () => "still works")).resolves.toBe("still works");
  });

  it("rejects an invalid concurrency", () => {
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(-1)).toThrow();
    expect(() => createLimiter(1.5)).toThrow();
  });
});
