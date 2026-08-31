import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDuration,
  formatLocalDateTime,
  formatLocalTime,
  isoDurationToMinutes,
  localTimeToMinutes,
  minutesBetween,
  minutesIntoDay,
  todayPlus,
} from "./format.js";

describe("isoDurationToMinutes", () => {
  it("parses hours and minutes", () => {
    expect(isoDurationToMinutes("PT13H45M")).toBe(825);
    expect(isoDurationToMinutes("PT2H")).toBe(120);
    expect(isoDurationToMinutes("PT30M")).toBe(30);
  });

  it("handles multi-day durations", () => {
    expect(isoDurationToMinutes("P1DT2H")).toBe(1560);
  });

  it("returns 0 for junk rather than NaN", () => {
    expect(isoDurationToMinutes(undefined)).toBe(0);
    expect(isoDurationToMinutes("nonsense")).toBe(0);
    expect(isoDurationToMinutes("")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(825)).toBe("13h 45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
  });

  it("shows a dash for missing durations", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("local wall-clock handling", () => {
  // Carriers publish local times with no zone. Parsing them with `new Date()`
  // reinterprets them in the viewer's zone and shifts every displayed time.
  it("does not shift a zoneless timestamp into the viewer's timezone", () => {
    expect(formatLocalTime("2026-09-15T13:45:00")).toBe("13:45");
    expect(formatLocalDateTime("2026-09-15T13:45:00")).toBe("15 Sep 13:45");
  });

  it("reads minutes into the day", () => {
    expect(minutesIntoDay("2026-09-15T13:45:00")).toBe(825);
    expect(minutesIntoDay("garbage")).toBeNull();
  });

  it("parses HH:MM filters", () => {
    expect(localTimeToMinutes("14:30")).toBe(870);
    expect(localTimeToMinutes("00:00")).toBe(0);
    expect(localTimeToMinutes("bad")).toBeNull();
  });
});

describe("minutesBetween", () => {
  it("uses real instants when both sides carry an offset", () => {
    // 10:00+02:00 -> 08:00Z ; 12:00+00:00 -> 12:00Z  = 240 minutes
    expect(minutesBetween("2026-09-15T10:00:00+02:00", "2026-09-15T12:00:00+00:00")).toBe(240);
  });

  it("compares naive stamps as local wall clock", () => {
    expect(minutesBetween("2026-09-15T10:00:00", "2026-09-15T12:30:00")).toBe(150);
  });

  it("spans midnight", () => {
    expect(minutesBetween("2026-09-15T23:30:00", "2026-09-16T01:00:00")).toBe(90);
  });
});

describe("date maths", () => {
  it("todayPlus uses the LOCAL date, not UTC", () => {
    // 2026-03-10 22:30 local. toISOString() would roll to the 11th for any
    // timezone east of UTC, which is exactly the off-by-one this replaced.
    const evening = new Date(2026, 2, 10, 22, 30, 0);
    expect(todayPlus(0, evening)).toBe("2026-03-10");
    expect(todayPlus(1, evening)).toBe("2026-03-11");
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-10-15", "2026-10-20")).toBe(5);
    expect(daysBetween("2026-10-20", "2026-10-15")).toBe(-5);
  });
});
