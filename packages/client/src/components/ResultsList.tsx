import { useMemo, useState } from "react";
import type { FlightOffer } from "@flighthunter/shared";
import { formatDuration, formatPrice } from "@flighthunter/shared";
import FlightCard from "./FlightCard";

interface Props {
  offers: FlightOffer[];
  pinned: string[];
  onTogglePin: (id: string) => void;
  loading: boolean;
}

const PAGE = 25;

export default function ResultsList({ offers, pinned, onTogglePin, loading }: Props) {
  const [airline, setAirline] = useState("");
  const [maxStops, setMaxStops] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = airline.trim().toLowerCase();
    return offers.filter((o) => {
      if (maxStops !== null && o.maxStops > maxStops) return false;
      if (needle) {
        // Match on code OR name, so "TK" and "turkish" both work regardless
        // of which provider supplied the offer.
        const hay = o.airlines.map((a) => `${a.code} ${a.name}`).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [offers, airline, maxStops]);

  const { cheapestId, fastestId } = useMemo(() => {
    let cheapest: FlightOffer | null = null;
    let fastest: FlightOffer | null = null;
    for (const o of filtered) {
      if (!cheapest || o.price.total < cheapest.price.total) cheapest = o;
      if (!fastest || o.totalDurationMinutes < fastest.totalDurationMinutes) fastest = o;
    }
    return { cheapestId: cheapest?.id ?? null, fastestId: fastest?.id ?? null };
  }, [filtered]);

  /** Best fare from each departure airport — the multi-origin payoff. */
  const perOrigin = useMemo(() => {
    const map = new Map<string, FlightOffer>();
    for (const o of filtered) {
      const current = map.get(o.origin);
      if (!current || o.price.total < current.price.total) map.set(o.origin, o);
    }
    return [...map.values()].sort((a, b) => a.price.total - b.price.total);
  }, [filtered]);

  if (offers.length === 0) {
    return (
      <div className="empty">
        {loading ? "Searching…" : "No results yet — run a search to see fares."}
      </div>
    );
  }

  const visible = filtered.slice(0, limit);

  return (
    <div className="results">
      {perOrigin.length > 1 && (
        <section className="per-origin">
          <h3>Cheapest from each origin</h3>
          <div className="origin-cards">
            {perOrigin.map((o) => (
              <div key={o.origin} className="origin-card">
                <div className="origin-route">
                  {o.origin} → {o.destination}
                </div>
                <div className="origin-price">{formatPrice(o.price.total, o.price.currency)}</div>
                <div className="muted">
                  {o.maxStops === 0 ? "Direct" : `${o.maxStops} stop${o.maxStops === 1 ? "" : "s"}`} ·{" "}
                  {formatDuration(o.totalDurationMinutes)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="refine">
        <strong>{filtered.length}</strong>
        <span className="muted">of {offers.length} shown</span>

        <input
          type="search"
          placeholder="Filter airline (TK, Turkish…)"
          value={airline}
          onChange={(e) => {
            setAirline(e.target.value);
            setLimit(PAGE);
          }}
        />

        <select
          value={maxStops === null ? "any" : String(maxStops)}
          onChange={(e) => {
            setMaxStops(e.target.value === "any" ? null : Number(e.target.value));
            setLimit(PAGE);
          }}
        >
          <option value="any">Any stops</option>
          <option value="0">Direct only</option>
          <option value="1">Up to 1 stop</option>
          <option value="2">Up to 2 stops</option>
        </select>

        {(airline || maxStops !== null) && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setAirline("");
              setMaxStops(null);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">Nothing matches those refinements.</div>
      ) : (
        <>
          <div className="offer-list">
            {visible.map((o) => (
              <FlightCard
                key={o.id}
                offer={o}
                pinned={pinned.includes(o.id)}
                onTogglePin={onTogglePin}
                isCheapest={o.id === cheapestId}
                isFastest={o.id === fastestId && o.id !== cheapestId}
              />
            ))}
          </div>

          {filtered.length > visible.length && (
            <button type="button" className="btn-more" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - visible.length)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
