import { useMemo, useState } from "react";
import type { Flight, SortKey } from "../types";

function fmtDuration(m: number) { return m ? `${Math.floor(m / 60)}h ${m % 60}m` : "—"; }
function fmtTime(iso: string) { return iso ? new Date(iso).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }

export default function ResultsTable({ flights }: { flights: Flight[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [asc, setAsc] = useState(true);
  const [airlineFilter, setAirlineFilter] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const toggle = (k: SortKey) => { if (k === sortKey) setAsc(!asc); else { setSortKey(k); setAsc(true); } };

  const sorted = useMemo(() => {
    let rows = [...flights];
    if (airlineFilter) rows = rows.filter((f) => f.airlines.join(",").toLowerCase().includes(airlineFilter.toLowerCase()));
    if (maxPrice && !isNaN(+maxPrice)) rows = rows.filter((f) => f.price <= +maxPrice);

    rows.sort((a, b) => {
      let c = 0;
      switch (sortKey) {
        case "price": c = a.price - b.price; break;
        case "duration": c = a.durationMinutes - b.durationMinutes; break;
        case "stops": c = a.stops - b.stops; break;
        case "origin": c = a.origin.localeCompare(b.origin); break;
        case "destination": c = a.destination.localeCompare(b.destination); break;
        case "departure": c = new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime(); break;
        case "airline": c = (a.airlines[0] || "").localeCompare(b.airlines[0] || ""); break;
      }
      return asc ? c : -c;
    });
    return rows;
  }, [flights, sortKey, asc, airlineFilter, maxPrice]);

  // Cheapest per origin summary
  const cheapestPerOrigin = useMemo(() => {
    const map = new Map<string, Flight>();
    for (const f of flights) { const c = map.get(f.origin); if (!c || f.price < c.price) map.set(f.origin, f); }
    return [...map.values()].sort((a, b) => a.price - b.price);
  }, [flights]);

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th onClick={() => toggle(k)} className="sortable">{label} {sortKey === k ? (asc ? "▲" : "▼") : ""}</th>
  );

  if (!flights.length) return <div className="empty">No results yet. Hit search above.</div>;

  return (
    <div>
      {/* Cheapest per origin cards */}
      <div className="summary">
        <h3>💸 Cheapest from each origin</h3>
        <div className="summary-cards">
          {cheapestPerOrigin.map((f) => (
            <div key={f.origin} className="summary-card">
              <div className="card-route">{f.origin} → {f.destination}</div>
              <div className="card-price">{f.price} {f.currency}</div>
              <div className="card-detail">{f.airlines.join(", ")} · {f.stops} stop(s) · {fmtDuration(f.durationMinutes)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline filters */}
      <div className="toolbar">
        <span>{sorted.length} results</span>
        <label>Airline: <input placeholder="TK, QR…" value={airlineFilter} onChange={(e) => setAirlineFilter(e.target.value)} /></label>
        <label>Max €: <input placeholder="600" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th k="origin" label="From" />
              <Th k="destination" label="To" />
              <Th k="price" label="Price" />
              <Th k="stops" label="Stops" />
              <Th k="duration" label="Duration" />
              <Th k="departure" label="Departs" />
              <Th k="airline" label="Airline" />
              <th>Source</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr key={f.id} className={f.source === "mock" ? "mock-row" : ""}>
                <td><strong>{f.origin}</strong></td>
                <td><strong>{f.destination}</strong></td>
                <td className="price">{f.price} {f.currency}</td>
                <td>{f.stops === 0 ? "Direct ✈️" : `${f.stops} stop(s)`}</td>
                <td>{fmtDuration(f.durationMinutes)}</td>
                <td>{fmtTime(f.departureAt)}</td>
                <td>{f.airlines.join(", ")}</td>
                <td><span className={`badge ${f.source}`}>{f.source}</span></td>
                <td>
                  {f.deepLink ? <a href={f.deepLink} target="_blank" rel="noreferrer">Book ↗</a> : null}
                  {f.legs.length > 0 && (
                    <details>
                      <summary>{f.legs.length} seg</summary>
                      {f.legs.map((l, i) => <div key={i} className="leg">{l.from}→{l.to} {l.carrier} {fmtTime(l.departureAt)}</div>)}
                    </details>
                  )}
                  {f.warnings?.map((w, i) => <div key={i} className="warning">{w}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}