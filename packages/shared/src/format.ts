/**
 * Formatting helpers shared by the API and the UI so both render a price,
 * a duration and a departure time identically.
 */

/** `PT13H45M` → 825. Returns 0 for anything unparseable. */
export function isoDurationToMinutes(value: string | undefined | null): number {
  if (!value) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value.trim());
  if (!m) return 0;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  return days * 1440 + hours * 60 + mins;
}

/** 825 → `"13h 45m"`. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Carriers publish local wall-clock times with no zone (`2026-09-15T13:45:00`).
 * Parsing those with `new Date()` reinterprets them in the *viewer's* zone and
 * shifts every time shown. So parse the digits directly and never convert.
 */
function parseWallClock(iso: string): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: Number(m[4]),
    mi: Number(m[5]),
  };
}

/** True when the timestamp carries an explicit UTC marker or numeric offset. */
export function hasTimezone(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso.trim());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `"2026-09-15T13:45:00"` → `"15 Sep 13:45"`, in the airport's own local time. */
export function formatLocalDateTime(iso: string): string {
  const p = parseWallClock(iso);
  if (!p) return "—";
  const month = MONTHS[p.mo - 1] ?? "?";
  return `${String(p.d).padStart(2, "0")} ${month} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** `"2026-09-15T13:45:00"` → `"13:45"`. */
export function formatLocalTime(iso: string): string {
  const p = parseWallClock(iso);
  if (!p) return "—";
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** Minutes past local midnight, for time-of-day window filtering. */
export function minutesIntoDay(iso: string): number | null {
  const p = parseWallClock(iso);
  if (!p) return null;
  return p.h * 60 + p.mi;
}

/** `"14:30"` → 870. */
export function localTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Calendar date portion, timezone-free. */
export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Elapsed minutes between two wall-clock stamps. When both carry a zone the
 * real instants are used; otherwise they are compared as naive local times,
 * which is the best available answer without a tz database.
 */
export function minutesBetween(fromIso: string, toIso: string): number {
  if (hasTimezone(fromIso) && hasTimezone(toIso)) {
    const a = Date.parse(fromIso);
    const b = Date.parse(toIso);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((b - a) / 60000);
  }
  const a = parseWallClock(fromIso);
  const b = parseWallClock(toIso);
  if (!a || !b) return 0;
  const toMs = (p: NonNullable<ReturnType<typeof parseWallClock>>) =>
    Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return Math.round((toMs(b) - toMs(a)) / 60000);
}

/** Local calendar date `N` days from today — not UTC, so it never lands a day off. */
export function todayPlus(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Shift a `YYYY-MM-DD` string by whole days without timezone drift. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Whole days between two `YYYY-MM-DD` strings. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const CURRENCY_DECIMALS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 0 };

export function formatPrice(amount: number, currency: string, locale?: string): string {
  // CURRENCY_DECIMALS lists the ISO-4217 ZERO-decimal currencies, so it only
  // makes sense as an exception table against a default of 2. Defaulting to 0
  // made the table dead code and rounded every fare: 412.99 rendered as "413",
  // and an alert could announce "reached your target of 300" at 300.49.
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

/** `["TK","LH"]` → `"TK + 1 more"`, keeping table cells narrow. */
export function summarizeAirlines(names: string[], max = 2): string {
  if (names.length === 0) return "—";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

/** Days-until helper used for the "book early" hint. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  return daysBetween(todayPlus(0, now), isoDate);
}
