import { z } from "zod";
import { Airport, CabinClass, CurrencyCode, IataCode, IsoDate } from "./domain.js";

/**
 * Explore ("where can I go?") turns the search around: you fix a budget and a
 * departure point, and the app finds destinations rather than fares. It is a
 * different question from normal search, so it gets its own request shape
 * instead of overloading SearchRequest with a mode flag.
 */

/** Coarse world regions, derived from an airport's IANA timezone prefix. */
export const Region = z.enum([
  "Europe",
  "Asia",
  "Africa",
  "America",
  "Australia",
  "Pacific",
  "Indian",
  "Atlantic",
]);
export type Region = z.infer<typeof Region>;

export const REGION_LABELS: Record<Region, string> = {
  Europe: "Europe",
  Asia: "Asia",
  Africa: "Africa",
  America: "Americas",
  Australia: "Oceania",
  Pacific: "Pacific",
  Indian: "Indian Ocean",
  Atlantic: "Atlantic",
};

/** An airport's region, from its IANA zone (`Asia/Tokyo` -> `Asia`). */
export function regionOf(tz: string): Region | null {
  const prefix = tz.split("/")[0];
  const parsed = Region.safeParse(prefix);
  return parsed.success ? parsed.data : null;
}

export const ExploreRequest = z
  .object({
    origins: z.array(IataCode).min(1).max(5),

    departureDate: IsoDate,
    /** Round trip of roughly this length. Omit for one-way exploration. */
    tripLengthDays: z.number().int().min(1).max(60).optional(),
    /** Also try departures within this many days either side. */
    flexDays: z.number().int().min(0).max(5).default(0),

    adults: z.number().int().min(1).max(9).default(1),
    cabin: CabinClass.default("ECONOMY"),
    currency: CurrencyCode.default("EUR"),

    /** The whole point: only show me what fits this budget. */
    maxPrice: z.number().positive().optional(),
    /** Restrict to these regions. Empty means anywhere. */
    regions: z.array(Region).max(8).default([]),
    /** Skip destinations further than this many hours of flying. */
    maxFlightHours: z.number().min(1).max(30).optional(),
    /** Skip destinations closer than this, to exclude the obvious neighbours. */
    minDistanceKm: z.number().int().min(0).max(20000).default(0),

    maxStops: z.number().int().min(0).max(3).optional(),
    /** How many candidate destinations to price. Higher is slower. */
    candidates: z.number().int().min(5).max(120).default(40),
    limit: z.number().int().min(1).max(100).default(30),

    sort: z.enum(["price", "distance", "duration"]).default("price"),
  })
  .superRefine((v, ctx) => {
    if (v.minDistanceKm > 0 && v.maxFlightHours !== undefined) {
      // ~840 km/h cruise; a floor above the ceiling can never match.
      const maxKm = v.maxFlightHours * 840;
      if (v.minDistanceKm > maxKm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minDistanceKm"],
          message: "Minimum distance is further than the maximum flight time allows",
        });
      }
    }
  });

export type ExploreRequest = z.infer<typeof ExploreRequest>;
export type ExploreRequestInput = z.input<typeof ExploreRequest>;

export const ExploreResult = z.object({
  destination: Airport,
  region: Region.nullable(),
  origin: IataCode,
  price: z.number().nonnegative(),
  currency: CurrencyCode,
  departureDate: IsoDate,
  returnDate: IsoDate.optional(),
  durationMinutes: z.number().int().nonnegative(),
  stops: z.number().int().nonnegative(),
  airlines: z.array(z.string()),
  distanceKm: z.number().nonnegative(),
  co2Kg: z.number().nonnegative().optional(),
  offerId: z.string(),
  deepLink: z.string().optional(),
});
export type ExploreResult = z.infer<typeof ExploreResult>;

export const ExploreResponse = z.object({
  results: z.array(ExploreResult),
  /** Destinations priced, before the budget filter removed any. */
  candidatesPriced: z.number().int().nonnegative(),
  /** Removed purely because they exceeded maxPrice. */
  overBudget: z.number().int().nonnegative(),
  currency: CurrencyCode,
  elapsedMs: z.number().nonnegative(),
  warnings: z.array(z.string()),
});
export type ExploreResponse = z.infer<typeof ExploreResponse>;
