import type { Airline, FlightOffer, Itinerary, SearchRequest } from "@flighthunter/shared";
import { config } from "../config.js";
import { getAirport } from "../data/airports.js";
import { request } from "../util/http.js";
import { toWallClock, wallClockInZone } from "../util/time.js";
import type { FlightProvider, ProviderContext, RoutePair } from "./types.js";

interface TpRow {
  origin?: string;
  destination?: string;
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}

interface TpResponse {
  success?: boolean;
  data?: TpRow[];
  error?: string;
}

function buildItinerary(
  direction: "outbound" | "inbound",
  departureIso: string,
  durationMinutes: number,
  stops: number,
  arrivalTz: string,
): Itinerary {
  const departedAt = Date.parse(departureIso);
  const arrivalAt =
    Number.isFinite(departedAt) && durationMinutes > 0
      ? wallClockInZone(departedAt + durationMinutes * 60_000, arrivalTz)
      : toWallClock(departureIso);

  return {
    direction,
    departureAt: toWallClock(departureIso),
    arrivalAt,
    durationMinutes: Math.max(0, durationMinutes),
    stops: Math.max(0, stops),
    // This endpoint returns fares, not routings — no segment detail exists.
    segments: [],
  };
}

export class TravelpayoutsProvider implements FlightProvider {
  readonly id = "travelpayouts" as const;
  readonly label = "Travelpayouts";

  isConfigured(): boolean {
    return config.hasTravelpayouts;
  }

  async search(
    pair: RoutePair,
    req: SearchRequest,
    ctx: ProviderContext,
  ): Promise<FlightOffer[]> {
    const res = await request<TpResponse>(
      "https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
      {
        query: {
          origin: pair.origin,
          destination: pair.destination,
          departure_at: pair.departureDate,
          return_at: pair.returnDate,
          currency: req.currency.toLowerCase(),
          sorting: "price",
          limit: Math.min(30, req.maxPerPair * 2),
          one_way: pair.returnDate ? "false" : "true",
          token: config.TRAVELPAYOUTS_TOKEN,
        },
        timeoutMs: config.PROVIDER_TIMEOUT_MS,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    );

    if (res.success === false) {
      throw new Error(res.error ?? "Travelpayouts rejected the request");
    }

    const destTz = getAirport(pair.destination)?.tz ?? "UTC";
    const originTz = getAirport(pair.origin)?.tz ?? "UTC";
    const fetchedAt = new Date().toISOString();
    const offers: FlightOffer[] = [];

    for (const row of res.data ?? []) {
      const price = row.price;
      const departure = row.departure_at;
      if (typeof price !== "number" || !Number.isFinite(price) || !departure) continue;

      const outboundMinutes = row.duration_to ?? row.duration ?? 0;
      const itineraries: Itinerary[] = [
        buildItinerary("outbound", departure, outboundMinutes, row.transfers ?? 0, destTz),
      ];

      // `return_at` is when the RETURN FLIGHT DEPARTS, not when the outbound
      // arrives. Treating it as an arrival time was a long-standing bug here.
      if (row.return_at) {
        itineraries.push(
          buildItinerary(
            "inbound",
            row.return_at,
            row.duration_back ?? 0,
            row.return_transfers ?? 0,
            originTz,
          ),
        );
      }

      const code = (row.airline ?? "").toUpperCase();
      const airlines: Airline[] = code ? [{ code, name: code }] : [];

      const offer: FlightOffer = {
        id: `tp:${pair.origin}-${pair.destination}:${departure}:${price}`,
        provider: "travelpayouts",
        origin: pair.origin,
        destination: pair.destination,
        price: { total: price, currency: req.currency },
        itineraries,
        airlines,
        totalDurationMinutes: itineraries.reduce((s, it) => s + it.durationMinutes, 0),
        maxStops: Math.max(...itineraries.map((it) => it.stops)),
        fetchedAt,
        warnings: ["Cached fare — verify on the airline site before booking"],
      };

      if (row.link) {
        const marker = config.TRAVELPAYOUTS_MARKER;
        const url = new URL(row.link, "https://www.aviasales.com");
        if (marker) url.searchParams.set("marker", marker);
        offer.deepLink = url.toString();
      }

      offers.push(offer);
    }

    return offers;
  }
}
