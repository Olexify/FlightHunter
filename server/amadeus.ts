import axios from "axios";
import type { NormalizedFlight, SearchParams } from "./types.js";

let tokenCache: { token: string; expiresAt: number } | null = null;

function baseUrl(): string {
  return process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
}

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token;
  }

  const res = await axios.post(
    `${baseUrl()}/v1/security/oauth2/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_CLIENT_ID!,
      client_secret: process.env.AMADEUS_CLIENT_SECRET!,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15_000 }
  );

  tokenCache = {
    token: res.data.access_token,
    expiresAt: Date.now() + res.data.expires_in * 1000,
  };
  return tokenCache.token;
}

function isoDurationToMin(d?: string): number {
  if (!d) return 0;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (+(m[1] || 0)) * 60 + +(m[2] || 0) : 0;
}

export async function searchAmadeusPair(
  origin: string,
  destination: string,
  p: SearchParams
): Promise<NormalizedFlight[]> {
  const token = await getToken();

  const params: Record<string, any> = {
    originLocationCode: origin,
    destinationLocationCode: destination,
    departureDate: p.departureDate,
    adults: p.adults,
    currencyCode: p.currency,
    max: p.maxPerPair ?? 5,
  };
  if (p.returnDate) params.returnDate = p.returnDate;
  if (p.maxStops === 0) params.nonStop = true;

  const res = await axios.get(`${baseUrl()}/v2/shopping/flight-offers`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 25_000,
  });

  const carriers: Record<string, string> = res.data.dictionaries?.carriers ?? {};

  return (res.data.data ?? []).map((offer: any): NormalizedFlight => {
    const itin = offer.itineraries[0];
    const segs = itin.segments;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const airlineCodes = [...new Set(segs.map((s: any) => s.carrierCode))] as string[];

    return {
      id: `am-${offer.id}-${origin}-${destination}`,
      source: "amadeus",
      origin,
      destination,
      price: parseFloat(offer.price.grandTotal ?? offer.price.total),
      currency: offer.price.currency,
      airlines: airlineCodes.map((c) => carriers[c] || c),
      stops: segs.length - 1,
      durationMinutes: isoDurationToMin(itin.duration),
      departureAt: first.departure.at,
      arrivalAt: last.arrival.at,
      legs: segs.map((s: any) => ({
        from: s.departure.iataCode,
        to: s.arrival.iataCode,
        departureAt: s.departure.at,
        arrivalAt: s.arrival.at,
        carrier: carriers[s.carrierCode] || s.carrierCode,
        flightNumber: s.number,
      })),
    };
  });
}