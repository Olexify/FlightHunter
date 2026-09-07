import { useState } from "react";
import type { ExploreResponse, ExploreResult, Region } from "@flighthunter/shared";
import { REGION_LABELS, formatDuration, formatPrice, todayPlus } from "@flighthunter/shared";
import AirportPicker from "./AirportPicker";

export interface ExploreForm {
  origins: string[];
  departureDate: string;
  tripLengthDays: number | null;
  maxPrice: number | null;
  regions: Region[];
  maxFlightHours: number | null;
  minDistanceKm: number;
  maxStops: number | null;
  candidates: number;
  sort: "price" | "distance" | "duration";
}

export function defaultExploreForm(currency = "EUR"): ExploreForm {
  void currency;
  return {
    origins: ["WAW"],
    departureDate: todayPlus(45),
    tripLengthDays: 7,
    maxPrice: 400,
    regions: [],
    maxFlightHours: null,
    minDistanceKm: 0,
    maxStops: null,
    candidates: 40,
    sort: "price",
  };
}

interface Props {
  form: ExploreForm;
  onChange: (patch: Partial<ExploreForm>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onPickDestination: (result: ExploreResult) => void;
  loading: boolean;
  data: ExploreResponse | null;
  error: string | null;
  currency: string;
}

const REGIONS: Region[] = [
  "Europe",
  "Asia",
  "America",
  "Africa",
  "Australia",
  "Pacific",
  "Indian",
  "Atlantic",
];

/**
 * "Where can I go?" — search by budget instead of by destination.
 *
 * Results are one card per destination (the cheapest way to reach it), so the
 * question being answered is "which places are within reach", not "which fare
 * is cheapest".
 */
export default function ExplorePanel({
  form,
  onChange,
  onSubmit,
  onCancel,
  onPickDestination,
  loading,
  data,
  error,
  currency,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);

  const toggleRegion = (r: Region): void => {
    onChange({
      regions: form.regions.includes(r)
        ? form.regions.filter((x) => x !== r)
        : [...form.regions, r],
    });
  };

  return (
    <div className="explore">
      <form
        className="explore-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="explore-row">
          <div className="explore-cell wide">
            <AirportPicker
              label="Flying from"
              selected={form.origins}
              onChange={(origins) => onChange({ origins })}
              placeholder="Add an origin…"
              max={5}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="xDepart">Departing</label>
            <input
              id="xDepart"
              type="date"
              value={form.departureDate}
              min={todayPlus(0)}
              onChange={(e) => onChange({ departureDate: e.target.value })}
              required
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="xTrip">Trip length</label>
            <select
              id="xTrip"
              value={form.tripLengthDays === null ? "oneway" : String(form.tripLengthDays)}
              onChange={(e) =>
                onChange({
                  tripLengthDays: e.target.value === "oneway" ? null : Number(e.target.value),
                })
              }
            >
              <option value="oneway">One way</option>
              <option value="3">3 days</option>
              <option value="7">1 week</option>
              <option value="10">10 days</option>
              <option value="14">2 weeks</option>
              <option value="21">3 weeks</option>
              <option value="30">1 month</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="xBudget">Budget</label>
            <input
              id="xBudget"
              type="number"
              min={0}
              placeholder="any"
              value={form.maxPrice ?? ""}
              onChange={(e) =>
                onChange({ maxPrice: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>

        <div className="chip-row">
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={form.regions.includes(r) ? "toggle-chip active" : "toggle-chip"}
              onClick={() => toggleRegion(r)}
            >
              {REGION_LABELS[r]}
            </button>
          ))}
          {form.regions.length > 0 && (
            <button type="button" className="btn-link" onClick={() => onChange({ regions: [] })}>
              Anywhere
            </button>
          )}
        </div>

        <button type="button" className="disclosure" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? "▾" : "▸"} More filters
        </button>

        {showFilters && (
          <div className="explore-row">
            <div className="field">
              <label className="field-label" htmlFor="xHours">Max flight hours</label>
              <input
                id="xHours"
                type="number"
                min={1}
                max={30}
                placeholder="any"
                value={form.maxFlightHours ?? ""}
                onChange={(e) =>
                  onChange({ maxFlightHours: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="xMinKm">At least (km away)</label>
              <input
                id="xMinKm"
                type="number"
                min={0}
                max={20000}
                step={500}
                value={form.minDistanceKm}
                onChange={(e) => onChange({ minDistanceKm: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="xStops">Max stops</label>
              <select
                id="xStops"
                value={form.maxStops === null ? "any" : String(form.maxStops)}
                onChange={(e) =>
                  onChange({ maxStops: e.target.value === "any" ? null : Number(e.target.value) })
                }
              >
                <option value="any">Any</option>
                <option value="0">Direct only</option>
                <option value="1">Up to 1</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="xCand">Destinations to check</label>
              <input
                id="xCand"
                type="number"
                min={5}
                max={120}
                step={5}
                value={form.candidates}
                onChange={(e) =>
                  onChange({ candidates: Math.min(120, Math.max(5, Number(e.target.value) || 40)) })
                }
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="xSort">Sort by</label>
              <select
                id="xSort"
                value={form.sort}
                onChange={(e) => onChange({ sort: e.target.value as ExploreForm["sort"] })}
              >
                <option value="price">Cheapest</option>
                <option value="distance">Nearest</option>
                <option value="duration">Shortest flight</option>
              </select>
            </div>
          </div>
        )}

        <div className="actions">
          {loading ? (
            <button type="button" className="btn-primary" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={form.origins.length === 0}>
              Find destinations
            </button>
          )}
        </div>
      </form>

      {error && <div className="error-box">{error}</div>}

      {loading && (
        <div className="loading-bar" role="status" aria-live="polite">
          Pricing {form.candidates} destinations…
        </div>
      )}

      {data && !loading && (
        <>
          <div className="refine">
            <strong>{data.results.length}</strong>
            <span className="muted">
              destination{data.results.length === 1 ? "" : "s"} within budget · {data.candidatesPriced}{" "}
              checked · {data.elapsedMs} ms
            </span>
          </div>

          {data.warnings.length > 0 && (
            <details className="warnings">
              <summary>{data.warnings.length} note(s)</summary>
              <ul>
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          {data.results.length === 0 ? (
            <div className="empty">
              Nothing within {form.maxPrice ? formatPrice(form.maxPrice, currency) : "range"} — try a
              bigger budget, a wider region, or more destinations to check.
            </div>
          ) : (
            <div className="explore-grid">
              {data.results.map((r) => (
                <button
                  key={r.destination.iata}
                  type="button"
                  className="explore-card"
                  onClick={() => onPickDestination(r)}
                  title="Search this route in full"
                >
                  <div className="explore-card-head">
                    <strong>{r.destination.city}</strong>
                    <span className="explore-price">{formatPrice(r.price, r.currency)}</span>
                  </div>
                  <div className="muted">
                    {r.destination.country} · {r.destination.iata}
                  </div>
                  <div className="explore-meta">
                    <span className={r.stops === 0 ? "tag tag-direct" : "tag"}>
                      {r.stops === 0 ? "Direct" : `${r.stops} stop${r.stops === 1 ? "" : "s"}`}
                    </span>
                    <span className="muted">{formatDuration(r.durationMinutes)}</span>
                    <span className="muted">{r.distanceKm.toLocaleString()} km</span>
                  </div>
                  <div className="muted explore-airline">
                    from {r.origin} · {r.airlines[0] ?? "—"}
                    {r.returnDate ? ` · back ${r.returnDate}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
