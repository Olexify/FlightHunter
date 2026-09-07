import { useEffect, useMemo, useState } from "react";
import type { FlightOffer } from "@flighthunter/shared";
import { formatDuration, formatPrice } from "@flighthunter/shared";
import type { Settings } from "../hooks/useSettings";
import FlightCard from "./FlightCard";

interface Props {
  offers: FlightOffer[];
  pinned: string[];
  onTogglePin: (id: string) => void;
  loading: boolean;
  settings: Settings;
}

/** Identity of the physical flight, ignoring which fare family it is sold as. */
function flightKey(o: FlightOffer): string {
  const legs = o.itineraries.map((it) =>
    it.segments.length > 0
      ? it.segments.map((s) => `${s.carrierCode}${s.flightNumber ?? ""}@${s.departureAt}`).join("+")
      : `${it.departureAt}>${it.arrivalAt}`,
  );
  return `${o.origin}-${o.destination}|${legs.join("||")}`;
}

export default function ResultsList({ offers, pinned, onTogglePin, loading, settings }: Props) {
  const [airline, setAirline] = useState("");
  const [maxStops, setMaxStops] = useState<number | null>(null);
  const [onlyWithBag, setOnlyWithBag] = useState(false);
  const [limit, setLimit] = useState(settings.resultsPerPage);

  // A settings change should take effect immediately, not after a new search.
  useEffect(() => setLimit(settings.resultsPerPage), [settings.resultsPerPage]);

  const filtered = useMemo(() => {
    const needle = airline.trim().toLowerCase();
    return offers.filter((o) => {
      if (maxStops !== null && o.maxStops > maxStops) return false;
      if (onlyWithBag && (!o.baggage || o.baggage.checkedBags < 1)) return false;
      if (needle) {
        // Match the CODE exactly and the NAME by substring, rather than
        // searching one concatenated blob: "CA" (Air China) used to also match
        // "Cathay Pacific", and "LO" matched anything containing "lo".
        const match = o.airlines.some(
          (a) => a.code.toLowerCase() === needle || a.name.toLowerCase().includes(needle),
        );
        if (!match) return false;
      }
      return true;
    });
  }, [offers, airline, maxStops, onlyWithBag]);

  /**
   * With fare-family collapsing on, show one row per physical flight and offer
   * the other fares as chips — otherwise every flight appears three times.
   */
  const { rows, siblingsFor } = useMemo(() => {
    if (!settings.groupFareBrands) {
      return { rows: filtered, siblingsFor: new Map<string, FlightOffer[]>() };
    }

    const groups = new Map<string, FlightOffer[]>();
    for (const o of filtered) {
      const key = flightKey(o);
      const list = groups.get(key);
      if (list) list.push(o);
      else groups.set(key, [o]);
    }

    const primary: FlightOffer[] = [];
    const siblings = new Map<string, FlightOffer[]>();

    for (const group of groups.values()) {
      const sorted = [...group].sort((a, b) => a.price.total - b.price.total);
      const head = sorted[0];
      if (!head) continue;
      primary.push(head);
      if (sorted.length > 1) siblings.set(head.id, sorted.slice(1));
    }

    // Preserve the server's ordering of whichever fare became the group head.
    const order = new Map(filtered.map((o, i) => [o.id, i]));
    primary.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { rows: primary, siblingsFor: siblings };
  }, [filtered, settings.groupFareBrands]);

  const { cheapestId, fastestId } = useMemo(() => {
    let cheapest: FlightOffer | null = null;
    let fastest: FlightOffer | null = null;
    for (const o of rows) {
      if (!cheapest || o.price.total < cheapest.price.total) cheapest = o;
      if (!fastest || o.totalDurationMinutes < fastest.totalDurationMinutes) fastest = o;
    }
    return { cheapestId: cheapest?.id ?? null, fastestId: fastest?.id ?? null };
  }, [rows]);

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

  const visible = rows.slice(0, limit);

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
        <strong>{rows.length}</strong>
        <span className="muted">
          of {offers.length}
          {settings.groupFareBrands && rows.length !== filtered.length ? " (fares grouped)" : ""}
        </span>

        <input
          type="search"
          placeholder="Filter airline (TK, Turkish…)"
          value={airline}
          onChange={(e) => {
            setAirline(e.target.value);
            setLimit(settings.resultsPerPage);
          }}
        />

        <select
          value={maxStops === null ? "any" : String(maxStops)}
          onChange={(e) => {
            setMaxStops(e.target.value === "any" ? null : Number(e.target.value));
            setLimit(settings.resultsPerPage);
          }}
        >
          <option value="any">Any stops</option>
          <option value="0">Direct only</option>
          <option value="1">Up to 1 stop</option>
          <option value="2">Up to 2 stops</option>
        </select>

        <label className="toggle inline">
          <input
            type="checkbox"
            checked={onlyWithBag}
            onChange={(e) => setOnlyWithBag(e.target.checked)}
          />
          <span>Bag included</span>
        </label>

        {(airline || maxStops !== null || onlyWithBag) && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setAirline("");
              setMaxStops(null);
              setOnlyWithBag(false);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
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
                settings={settings}
                {...(siblingsFor.get(o.id) ? { siblings: siblingsFor.get(o.id) } : {})}
                onPickSibling={onTogglePin}
              />
            ))}
          </div>

          {rows.length > visible.length && (
            <button
              type="button"
              className="btn-more"
              onClick={() => setLimit((l) => l + settings.resultsPerPage)}
            >
              Show {Math.min(settings.resultsPerPage, rows.length - visible.length)} more
              <span className="muted"> · {rows.length - visible.length} remaining</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
