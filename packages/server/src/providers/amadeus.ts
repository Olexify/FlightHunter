import type { Airline, FlightOffer, Itinerary, Segment, SearchRequest } from "@flighthunter/shared";
import { isoDurationToMinutes, minutesBetween } from "@flighthunter/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { HttpError, request } from "../util/http.js";
import type { FlightProvider, ProviderContext, RoutePair } from "./types.js";

/* ---------------------------- upstream shapes ---------------------------- */

interface AmadeusSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number?: string;
  aircraft?: { code?: string };
  duration?: string;
}

interface AmadeusItinerary {
  duration?: string;
  segments: AmadeusSegment[];
}

interface AmadeusOffer {
  id: string;
  itineraries: AmadeusItinerary[];
  price: { currency: string; total: string; grandTotal?: string };
  numberOfBookableSeats?: number;
  travelerPricings?: Array<{
    fareDetailsBySegment?: Array<{ cabin?: string }>;
  }>;
}

interface AmadeusResponse {
  data?: AmadeusOffer[];
  dictionaries?: {
    carriers?: Record<string, string>;
    aircraft?: Record<string, string>;
  };
}

/* ------------------------------- token cache ------------------------------ */

let token: { value: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

/**
 * OAuth token, cached until shortly before expiry. Concurrent callers share
 * one request — 30 parallel pair searches must not trigger 30 token fetches.
 */
async function getToken(signal?: AbortSignal): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await request<{ access_token: string; expires_in: number }>(
        `${config.AMADEUS_BASE_URL}/v1/security/oauth2/token`,
        {
          method: "POST",
          form: true,
          body: {
            grant_type: "client_credentials",
            client_id: config.AMADEUS_CLIENT_ID ?? "",
            client_secret: config.AMADEUS_CLIENT_SECRET ?? "",
          },
          timeoutMs: 15_000,
          retries: 1,
          signal,
        },
      );
      token = {
        value: res.access_token,
        // Refresh a minute early to avoid racing the expiry boundary.
        expiresAt: Date.now() + Math.max(0, res.expires_in - 60) * 1000,
      };
      return token.value;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Exposed for tests and for forcing a refresh after a 401. */
export function resetAmadeusToken(): void {
  token = null;
}

/* ------------------------------ normalisation ----------------------------- */

function toSegments(
  segs: AmadeusSegment[],
  carriers: Record<string, string>,
  aircraft: Record<string, string>,
): Segment[] {
  return segs.map((s, i): Segment => {
    const next = segs[i + 1];
    const duration =
      isoDurationToMinutes(s.duration) || minutesBetween(s.departure.at, s.arrival.at);

    const seg: Segment = {
      from: s.departure.iataCode,
      to: s.arrival.iataCode,
      departureAt: s.departure.at,
      arrivalAt: s.arrival.at,
      carrierCode: s.carrierCode,
      // Keep the code AND the name. Filtering by "TK" and displaying
      // "Turkish Airlines" must both work, whatever the provider.
      carrierName: carriers[s.carrierCode] ?? s.carrierCode,
      durationMinutes: Math.max(0, duration),
    };
    if (s.number) seg.flightNumber = s.number;
    const ac = s.aircraft?.code;
    if (ac) seg.aircraft = aircraft[ac] ?? ac;
    if (next) {
      seg.layoverMinutes = Math.max(0, minutesBetween(s.arrival.at, next.departure.at));
    }
    return seg;
  });
}

function toItinerary(
  raw: AmadeusItinerary,
  index: number,
  carriers: Record<string, string>,
  aircraft: Record<string, string>,
): Itinerary | null {
  const segs = raw.segments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last) return null;

  const segments = toSegments(segs, carriers, aircraft);
  const duration =
    isoDurationToMinutes(raw.duration) || minutesBetween(first.departure.at, last.arrival.at);

  return {
    direction: index === 0 ? "outbound" : "inbound",
    departureAt: first.departure.at,
    arrivalAt: last.arrival.at,
    durationMinutes: Math.max(0, duration),
    stops: Math.max(0, segs.length - 1),
    segments,
  };
}

function normalizeOffer(
  offer: AmadeusOffer,
  pair: RoutePair,
  dict: NonNullable<AmadeusResponse["dictionaries"]>,
  fetchedAt: string,
): FlightOffer | null {
  const carriers = dict.carriers ?? {};
  const aircraft = dict.aircraft ?? {};

  // Map EVERY itinerary, not just the first. Dropping the inbound leg is what
  // made round-trip durations and stop counts wrong in the previous version.
  const itineraries = (offer.itineraries ?? [])
    .map((it, i) => toItinerary(it, i, carriers, aircraft))
    .filter((it): it is Itinerary => it !== null);

  if (itineraries.length === 0) return null;

  const airlineMap = new Map<string, Airline>();
  for (const it of itineraries) {
    for (const s of it.segments) {
      if (!airlineMap.has(s.carrierCode)) {
        airlineMap.set(s.carrierCode, { code: s.carrierCode, name: s.carrierName });
      }
    }
  }

  const total = Number.parseFloat(offer.price.grandTotal ?? offer.price.total);
  if (!Number.isFinite(total)) return null;

  const cabinRaw = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin;
  const cabin =
    cabinRaw === "ECONOMY" ||
    cabinRaw === "PREMIUM_ECONOMY" ||
    cabinRaw === "BUSINESS" ||
    cabinRaw === "FIRST"
      ? cabinRaw
      : undefined;

  const result: FlightOffer = {
    id: `am:${pair.origin}-${pair.destination}:${pair.departureDate}:${offer.id}`,
    provider: "amadeus",
    origin: pair.origin,
    destination: pair.destination,
    price: { total, currency: offer.price.currency },
    itineraries,
    airlines: [...airlineMap.values()],
    totalDurationMinutes: itineraries.reduce((sum, it) => sum + it.durationMinutes, 0),
    maxStops: Math.max(...itineraries.map((it) => it.stops)),
    fetchedAt,
  };
  if (cabin) result.cabin = cabin;
  if (offer.numberOfBookableSeats && offer.numberOfBookableSeats > 0) {
    result.seatsRemaining = offer.numberOfBookableSeats;
  }
  return result;
}

/* -------------------------------- provider -------------------------------- */

export class AmadeusProvider implements FlightProvider {
  readonly id = "amadeus" as const;
  readonly label = "Amadeus";

  isConfigured(): boolean {
    return config.hasAmadeus;
  }

  async search(
    pair: RoutePair,
    req: SearchRequest,
    ctx: ProviderContext,
  ): Promise<FlightOffer[]> {
    const accessToken = await getToken(ctx.signal);

    const query: Record<string, string | number | boolean | undefined> = {
      originLocationCode: pair.origin,
      destinationLocationCode: pair.destination,
      departureDate: pair.departureDate,
      adults: req.adults,
      currencyCode: req.currency,
      max: req.maxPerPair,
      travelClass: req.cabin,
    };
    if (pair.returnDate) query.returnDate = pair.returnDate;
    if (req.children > 0) query.children = req.children;
    if (req.infants > 0) query.infants = req.infants;
    // Amadeus only exposes a boolean non-stop flag; richer stop limits are
    // applied by our own filter stage after normalisation.
    if (req.maxStops === 0) query.nonStop = true;
    if (req.includeAirlines.length > 0) {
      query.includedAirlineCodes = req.includeAirlines.join(",");
    } else if (req.excludeAirlines.length > 0) {
      // Amadeus rejects both filters at once, so only send one.
      query.excludedAirlineCodes = req.excludeAirlines.join(",");
    }

    let res: AmadeusResponse;
    try {
      res = await request<AmadeusResponse>(`${config.AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        query,
        timeoutMs: config.PROVIDER_TIMEOUT_MS,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
    } catch (err) {
      // A stale token survives our expiry math only if the clock skews; retry once.
      if (err instanceof HttpError && err.status === 401) {
        logger.warn("Amadeus token rejected, refreshing once");
        resetAmadeusToken();
        const fresh = await getToken(ctx.signal);
        res = await request<AmadeusResponse>(
          `${config.AMADEUS_BASE_URL}/v2/shopping/flight-offers`,
          {
            headers: { Authorization: `Bearer ${fresh}` },
            query,
            timeoutMs: config.PROVIDER_TIMEOUT_MS,
            retries: 0,
            ...(ctx.signal ? { signal: ctx.signal } : {}),
          },
        );
      } else {
        throw err;
      }
    }

    const fetchedAt = new Date().toISOString();
    const dict = res.dictionaries ?? {};
    return (res.data ?? [])
      .map((o) => normalizeOffer(o, pair, dict, fetchedAt))
      .filter((o): o is FlightOffer => o !== null);
  }
}

/** Pull the useful sentence out of an Amadeus error envelope. */
export function describeAmadeusError(err: unknown): string {
  if (err instanceof HttpError) {
    const body = err.body as { errors?: Array<{ detail?: string; title?: string }> } | undefined;
    const first = body?.errors?.[0];
    const detail = first?.detail ?? first?.title;
    if (detail) return `${detail} (HTTP ${err.status})`;
    return `HTTP ${err.status} ${err.statusText}`;
  }
  return err instanceof Error ? err.message : String(err);
}
