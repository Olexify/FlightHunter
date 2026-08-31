import type { FlightOffer, Itinerary, ProviderId, Segment } from "@flighthunter/shared";

/** Test-only builders. Kept beside the code so fixtures track the real types. */

export function segment(over: Partial<Segment> = {}): Segment {
  return {
    from: "WAW",
    to: "NRT",
    departureAt: "2026-10-15T10:00:00",
    arrivalAt: "2026-10-15T22:00:00",
    carrierCode: "TK",
    carrierName: "Turkish Airlines",
    flightNumber: "123",
    durationMinutes: 720,
    ...over,
  };
}

export function itinerary(over: Partial<Itinerary> = {}): Itinerary {
  const segments = over.segments ?? [segment()];
  const first = segments[0];
  const last = segments[segments.length - 1];

  return {
    direction: "outbound",
    departureAt: first?.departureAt ?? "2026-10-15T10:00:00",
    arrivalAt: last?.arrivalAt ?? "2026-10-15T22:00:00",
    durationMinutes: segments.reduce((n, s) => n + s.durationMinutes + (s.layoverMinutes ?? 0), 0),
    stops: Math.max(0, segments.length - 1),
    ...over,
    segments,
  };
}

export function offer(over: Partial<FlightOffer> = {}): FlightOffer {
  const itineraries = over.itineraries ?? [itinerary()];

  return {
    id: over.id ?? "test-1",
    provider: (over.provider ?? "mock") as ProviderId,
    origin: "WAW",
    destination: "NRT",
    price: { total: 500, currency: "EUR" },
    airlines: [{ code: "TK", name: "Turkish Airlines" }],
    totalDurationMinutes: itineraries.reduce((n, i) => n + i.durationMinutes, 0),
    maxStops: Math.max(...itineraries.map((i) => i.stops)),
    ...over,
    itineraries,
  };
}
