/**
 * Timezone helpers. Carriers publish local wall-clock times with no offset, so
 * everything downstream expects `YYYY-MM-DDTHH:MM:SS` in the airport's own zone.
 */

/** Render an instant as wall-clock time in a specific IANA timezone. */
export function wallClockInZone(epochMs: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(epochMs));

    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
    // Some engines emit "24" for midnight under hour12:false.
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
  } catch {
    // Unknown zone — fall back to UTC rather than throwing mid-search.
    return new Date(epochMs).toISOString().slice(0, 19);
  }
}

/** Strip any offset/Z suffix, keeping the local wall-clock reading. */
export function toWallClock(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/.exec(iso.trim());
  if (!m?.[1]) return iso;
  const base = m[1].replace(" ", "T");
  return base.length === 16 ? `${base}:00` : base;
}

/**
 * The UTC instant at which a given wall-clock time occurs in `timeZone`.
 * Solved by probing: format a guess back into the zone and correct the delta.
 */
export function zonedWallClockToEpoch(wallClock: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(wallClock);
  if (!m) return Number.NaN;

  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  let guess = Date.UTC(y, mo - 1, d, h, mi);

  // Two passes converge for every real zone, including half-hour offsets.
  for (let i = 0; i < 2; i++) {
    const rendered = wallClockInZone(guess, timeZone);
    const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(rendered);
    if (!r) break;
    const [, ry, rmo, rd, rh, rmi] = r.map(Number) as [
      number, number, number, number, number, number,
    ];
    const diff = Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(ry, rmo - 1, rd, rh, rmi);
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}
