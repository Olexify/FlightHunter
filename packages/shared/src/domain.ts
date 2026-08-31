import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** IATA airport / city code. Always stored upper-case. */
export const IataCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Must be a 3-letter IATA code");

/** IATA airline code (2 alphanumeric chars, e.g. "TK", "LO", "9W"). */
export const AirlineCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-Z]{2,3}$/, "Must be a 2-3 character airline code");

export const CurrencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Must be a 3-letter currency code");

/**
 * Calendar date, `YYYY-MM-DD`. Validates the day actually exists, so
 * 2026-02-30 is rejected rather than silently rolling over to March.
 */
export const IsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Not a real calendar date");

/** Wall-clock time of day, `HH:MM` in the airport's local timezone. */
export const LocalTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM");

export const CabinClass = z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]);
export type CabinClass = z.infer<typeof CabinClass>;

export const ProviderId = z.enum(["amadeus", "travelpayouts", "mock"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const SortKey = z.enum(["best", "price", "duration", "stops", "departure", "arrival"]);
export type SortKey = z.infer<typeof SortKey>;

/* ------------------------------------------------------------------ */
/* Airports                                                            */
/* ------------------------------------------------------------------ */

export const Airport = z.object({
  iata: IataCode,
  name: z.string(),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** IANA timezone, e.g. "Asia/Tokyo". Drives local-time rendering. */
  tz: z.string(),
  /** Route-endpoint count from OpenFlights; a proxy for how major the hub is. */
  routes: z.number().int().nonnegative(),
});
export type Airport = z.infer<typeof Airport>;

/* ------------------------------------------------------------------ */
/* Flight offers                                                       */
/* ------------------------------------------------------------------ */

export const Segment = z.object({
  from: IataCode,
  to: IataCode,
  /** Local departure time at `from`, ISO-8601 without zone (as carriers publish it). */
  departureAt: z.string(),
  arrivalAt: z.string(),
  carrierCode: z.string(),
  /**
   * Human-readable carrier name when the provider supplies a dictionary.
   * Kept *alongside* the code — never instead of it, so filtering by "TK"
   * and displaying "Turkish Airlines" both work regardless of provider.
   */
  carrierName: z.string(),
  flightNumber: z.string().optional(),
  aircraft: z.string().optional(),
  durationMinutes: z.number().int().nonnegative(),
  /** Ground time before the *next* segment; undefined on the final segment. */
  layoverMinutes: z.number().int().nonnegative().optional(),
});
export type Segment = z.infer<typeof Segment>;

/**
 * One directional journey. A one-way offer has exactly one; a round trip has
 * two. Modelling this explicitly is what keeps return legs from being dropped.
 */
export const Itinerary = z.object({
  direction: z.enum(["outbound", "inbound"]),
  departureAt: z.string(),
  arrivalAt: z.string(),
  durationMinutes: z.number().int().nonnegative(),
  stops: z.number().int().nonnegative(),
  segments: z.array(Segment),
});
export type Itinerary = z.infer<typeof Itinerary>;

export const Money = z.object({
  total: z.number().nonnegative(),
  currency: CurrencyCode,
  /** Total in the user's requested display currency, when converted. */
  convertedTotal: z.number().nonnegative().optional(),
  convertedCurrency: CurrencyCode.optional(),
});
export type Money = z.infer<typeof Money>;

export const Airline = z.object({ code: z.string(), name: z.string() });
export type Airline = z.infer<typeof Airline>;

export const FlightOffer = z.object({
  id: z.string(),
  provider: ProviderId,
  origin: IataCode,
  destination: IataCode,
  price: Money,
  /** `[outbound]` or `[outbound, inbound]`. */
  itineraries: z.array(Itinerary).min(1),
  airlines: z.array(Airline),
  /** Sum across every itinerary — the real door-to-door air time. */
  totalDurationMinutes: z.number().int().nonnegative(),
  /** Worst leg's stop count, so a 0-stop out / 2-stop back trip filters as 2. */
  maxStops: z.number().int().nonnegative(),
  cabin: CabinClass.optional(),
  seatsRemaining: z.number().int().positive().optional(),
  deepLink: z.string().optional(),
  /** 0-100 composite desirability; higher is better. Filled by the ranker. */
  score: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  /** When the provider priced this. Used to age out stale cached quotes. */
  fetchedAt: z.string().optional(),
});
export type FlightOffer = z.infer<typeof FlightOffer>;

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export const SearchRequest = z
  .object({
    origins: z.array(IataCode).min(1).max(30),
    destinations: z.array(IataCode).min(1).max(30),
    departureDate: IsoDate,
    returnDate: IsoDate.optional(),

    adults: z.number().int().min(1).max(9).default(1),
    children: z.number().int().min(0).max(8).default(0),
    infants: z.number().int().min(0).max(8).default(0),
    cabin: CabinClass.default("ECONOMY"),

    currency: CurrencyCode.default("EUR"),
    maxPerPair: z.number().int().min(1).max(50).default(8),

    /** Search departureDate ± flexDays, producing a price grid. 0 disables. */
    flexDays: z.number().int().min(0).max(7).default(0),
    /** Pull in additional origin airports within this radius. 0 disables. */
    nearbyRadiusKm: z.number().int().min(0).max(500).default(0),

    maxStops: z.number().int().min(0).max(5).optional(),
    maxDurationMinutes: z.number().int().min(60).max(60 * 72).optional(),
    maxLayoverMinutes: z.number().int().min(30).max(60 * 48).optional(),
    minLayoverMinutes: z.number().int().min(0).max(60 * 24).optional(),
    maxPrice: z.number().positive().optional(),

    includeAirlines: z.array(AirlineCode).max(30).default([]),
    excludeAirlines: z.array(AirlineCode).max(30).default([]),

    departAfter: LocalTime.optional(),
    departBefore: LocalTime.optional(),
    arriveAfter: LocalTime.optional(),
    arriveBefore: LocalTime.optional(),

    sort: SortKey.default("best"),
  })
  .superRefine((v, ctx) => {
    if (v.returnDate && v.returnDate < v.departureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["returnDate"],
        message: "Return date cannot be before the departure date",
      });
    }
    if (v.infants > v.adults) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["infants"],
        message: "Each infant must be accompanied by an adult",
      });
    }
    const overlap = v.includeAirlines.filter((a) => v.excludeAirlines.includes(a));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["excludeAirlines"],
        message: `Airline(s) both included and excluded: ${overlap.join(", ")}`,
      });
    }
    if (
      v.minLayoverMinutes !== undefined &&
      v.maxLayoverMinutes !== undefined &&
      v.minLayoverMinutes > v.maxLayoverMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minLayoverMinutes"],
        message: "Minimum layover cannot exceed the maximum",
      });
    }
  });

/** Fully-defaulted search, i.e. what the server actually works with. */
export type SearchRequest = z.infer<typeof SearchRequest>;
/** What a caller may send; defaults are still optional here. */
export type SearchRequestInput = z.input<typeof SearchRequest>;

export const ProviderStatus = z.object({
  provider: ProviderId,
  ok: z.boolean(),
  offers: z.number().int().nonnegative(),
  /** How many route lookups were served from cache rather than the network. */
  cacheHits: z.number().int().nonnegative(),
  /** Pair-level failures, surfaced instead of silently swallowed. */
  errors: z.array(z.string()),
  elapsedMs: z.number().nonnegative(),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;

/** One cell of the flexible-date matrix. */
export const PriceGridCell = z.object({
  departureDate: IsoDate,
  returnDate: IsoDate.optional(),
  cheapestPrice: z.number().nonnegative().nullable(),
  currency: CurrencyCode,
  offerId: z.string().nullable(),
});
export type PriceGridCell = z.infer<typeof PriceGridCell>;

export const SearchResponse = z.object({
  searchId: z.string(),
  offers: z.array(FlightOffer),
  /** Offers returned before filters were applied — shows what filtering cost. */
  totalBeforeFilters: z.number().int().nonnegative(),
  providers: z.array(ProviderStatus),
  priceGrid: z.array(PriceGridCell),
  /** Origins added automatically by the nearby-airport expansion. */
  expandedOrigins: z.array(IataCode),
  currency: CurrencyCode,
  cached: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  warnings: z.array(z.string()),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

/* ------------------------------------------------------------------ */
/* Persistence-backed features                                         */
/* ------------------------------------------------------------------ */

export const SavedSearch = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  request: z.unknown(),
  createdAt: z.string(),
  lastRunAt: z.string().nullable(),
  lastCheapest: z.number().nullable(),
});
export type SavedSearch = z.infer<typeof SavedSearch>;

export const CreateSavedSearch = z.object({
  name: z.string().trim().min(1).max(120),
  request: SearchRequest,
});

export const Alert = z.object({
  id: z.string(),
  name: z.string(),
  request: z.unknown(),
  /** Fire when the cheapest offer drops to or below this. */
  targetPrice: z.number().positive().nullable(),
  /** Fire when the cheapest offer falls this many percent below the baseline. */
  dropPercent: z.number().min(1).max(90).nullable(),
  currency: CurrencyCode,
  active: z.boolean(),
  createdAt: z.string(),
  lastCheckedAt: z.string().nullable(),
  lastPrice: z.number().nullable(),
  baselinePrice: z.number().nullable(),
  triggeredAt: z.string().nullable(),
});
export type Alert = z.infer<typeof Alert>;

export const CreateAlert = z
  .object({
    name: z.string().trim().min(1).max(120),
    request: SearchRequest,
    targetPrice: z.number().positive().nullable().default(null),
    dropPercent: z.number().min(1).max(90).nullable().default(null),
  })
  .refine((v) => v.targetPrice !== null || v.dropPercent !== null, {
    message: "Set a target price, a drop percentage, or both",
    path: ["targetPrice"],
  });

export const PricePoint = z.object({
  observedAt: z.string(),
  price: z.number().nonnegative(),
  currency: CurrencyCode,
  origin: IataCode,
  destination: IataCode,
  departureDate: IsoDate,
});
export type PricePoint = z.infer<typeof PricePoint>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
