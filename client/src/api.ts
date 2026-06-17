import type { Flight, AirportInfo } from "./types";

export async function fetchPresets(): Promise<{ europeOrigins: AirportInfo[]; japanDestinations: AirportInfo[] }> {
  const res = await fetch("/api/presets");
  return res.json();
}

export async function searchFlights(body: {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
  maxStops?: number;
  currency: string;
}): Promise<{ count: number; flights: Flight[]; errors: string[] }> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}