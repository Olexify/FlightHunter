import type { FlightOffer } from "@flighthunter/shared";
import { formatDuration } from "@flighthunter/shared";

/** RFC 4180 escaping: quote when the value contains a delimiter, quote or newline. */
function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADERS = [
  "origin",
  "destination",
  "price",
  "currency",
  "stops",
  "total_duration",
  "total_duration_minutes",
  "outbound_departure",
  "outbound_arrival",
  "inbound_departure",
  "inbound_arrival",
  "airlines",
  "airline_codes",
  "cabin",
  "provider",
  "score",
  "routing",
  "deep_link",
] as const;

export function offersToCsv(offers: FlightOffer[]): string {
  const lines: string[] = [HEADERS.join(",")];

  for (const o of offers) {
    const outbound = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
    const inbound = o.itineraries.find((i) => i.direction === "inbound");

    const routing = o.itineraries
      .map((it) =>
        it.segments.length > 0
          ? [it.segments[0]?.from, ...it.segments.map((s) => s.to)].filter(Boolean).join(">")
          : `${o.origin}>${o.destination}`,
      )
      .join(" | ");

    lines.push(
      [
        cell(o.origin),
        cell(o.destination),
        cell(o.price.total),
        cell(o.price.currency),
        cell(o.maxStops),
        cell(formatDuration(o.totalDurationMinutes)),
        cell(o.totalDurationMinutes),
        cell(outbound?.departureAt),
        cell(outbound?.arrivalAt),
        cell(inbound?.departureAt),
        cell(inbound?.arrivalAt),
        cell(o.airlines.map((a) => a.name).join(" / ")),
        cell(o.airlines.map((a) => a.code).join(" / ")),
        cell(o.cabin),
        cell(o.provider),
        cell(o.score),
        cell(routing),
        cell(o.deepLink),
      ].join(","),
    );
  }

  // Excel on Windows needs the BOM to read UTF-8 airline names correctly.
  return `﻿${lines.join("\r\n")}`;
}
