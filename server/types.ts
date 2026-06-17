export interface SearchParams {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
  maxStops?: number;
  currency: string;
  maxPerPair?: number;
}

export interface NormalizedFlight {
  id: string;
  source: "amadeus" | "travelpayouts" | "mock";
  origin: string;
  destination: string;
  price: number;
  currency: string;
  airlines: string[];
  stops: number;
  durationMinutes: number;
  departureAt: string;
  arrivalAt: string;
  legs: FlightLeg[];
  deepLink?: string;
  warnings?: string[];
}

export interface FlightLeg {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  carrier: string;
  flightNumber?: string;
}