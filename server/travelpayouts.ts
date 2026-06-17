import axios from "axios";
import type { NormalizedFlight } from "./types.js";

export async function searchTravelpayoutsPair(
  origin: string,
  destination: string,
  departDate: string,
  currency: string
): Promise<NormalizedFlight[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return [];

  try {
    const res = await axios.get("https://api.travelpayouts.com/aviasales/v3/prices_for_dates", {
      params: {
        origin,
        destination,
        departure_at: departDate,
        currency: currency.toLowerCase(),
        sorting: "price",
        limit: 10,
        token,
      },
      timeout: 10_000,
    });

    return (res.data.data ?? []).map((d: any): NormalizedFlight => ({
      id: `tp-${origin}-${destination}-${d.departure_at}-${d.price}`,
      source: "travelpayouts",
      origin,
      destination,
      price: d.price,
      currency: currency.toUpperCase(),
      airlines: [d.airline],
      stops: d.transfers ?? 0,
      durationMinutes: d.duration ?? 0,
      departureAt: d.departure_at,
      arrivalAt: d.return_at ?? d.departure_at,
      legs: [],
      deepLink: d.link ? `https://www.aviasales.com${d.link}` : undefined,
    }));
  } catch {
    return [];
  }
}