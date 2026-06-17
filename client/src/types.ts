export interface Flight {
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
  legs: { from: string; to: string; departureAt: string; arrivalAt: string; carrier: string; flightNumber?: string }[];
  deepLink?: string;
  warnings?: string[];
}

export interface AirportInfo { code: string; city: string; }

export type SortKey = "price" | "duration" | "stops" | "origin" | "destination" | "departure" | "airline";