import { useState } from "react";
import type { CabinClass, RoutePreset, SortKey } from "@flighthunter/shared";
import { todayPlus } from "@flighthunter/shared";
import type { FormState } from "../searchParams";
import AirportPicker from "./AirportPicker";

interface Props {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSave: () => void;
  loading: boolean;
  presets: RoutePreset[];
  currencies: string[];
  routeCount: number;
}

const CABINS: Array<{ value: CabinClass; label: string }> = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First" },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "best", label: "Best value" },
  { value: "price", label: "Cheapest" },
  { value: "duration", label: "Fastest" },
  { value: "stops", label: "Fewest stops" },
  { value: "departure", label: "Departure time" },
  { value: "arrival", label: "Arrival time" },
];

export default function SearchForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  onSave,
  loading,
  presets,
  currencies,
  routeCount,
}: Props) {
  const [advanced, setAdvanced] = useState(false);

  const applyPreset = (preset: RoutePreset): void => {
    onChange({ origins: preset.origins, destinations: preset.destinations });
  };

  const swap = (): void => {
    onChange({ origins: form.destinations, destinations: form.origins });
  };

  return (
    <form
      className="search-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="presets">
        {presets.map((p) => (
          <button key={p.id} type="button" className="preset" title={p.description} onClick={() => applyPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <AirportPicker
        label="From"
        selected={form.origins}
        onChange={(origins) => onChange({ origins })}
        placeholder="Add a departure airport…"
      />

      <div className="swap-row">
        <button type="button" className="swap" onClick={swap} title="Swap origins and destinations">
          ⇅ Swap
        </button>
      </div>

      <AirportPicker
        label="To"
        selected={form.destinations}
        onChange={(destinations) => onChange({ destinations })}
        placeholder="Add a destination airport…"
      />

      <div className="grid2">
        <div className="field">
          <label className="field-label" htmlFor="depart">Departure</label>
          <input
            id="depart"
            type="date"
            value={form.departureDate}
            min={todayPlus(0)}
            onChange={(e) => onChange({ departureDate: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="return">Return <span className="muted">optional</span></label>
          <input
            id="return"
            type="date"
            value={form.returnDate}
            min={form.departureDate || todayPlus(0)}
            onChange={(e) => onChange({ returnDate: e.target.value })}
          />
        </div>
      </div>

      <div className="grid3">
        <div className="field">
          <label className="field-label" htmlFor="adults">Adults</label>
          <input
            id="adults"
            type="number"
            min={1}
            max={9}
            value={form.adults}
            onChange={(e) => onChange({ adults: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="cabin">Cabin</label>
          <select id="cabin" value={form.cabin} onChange={(e) => onChange({ cabin: e.target.value as CabinClass })}>
            {CABINS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="currency">Currency</label>
          <select id="currency" value={form.currency} onChange={(e) => onChange({ currency: e.target.value })}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid3">
        <div className="field">
          <label className="field-label" htmlFor="stops">Max stops</label>
          <select
            id="stops"
            value={form.maxStops === null ? "any" : String(form.maxStops)}
            onChange={(e) =>
              onChange({ maxStops: e.target.value === "any" ? null : Number(e.target.value) })
            }
          >
            <option value="0">Direct only</option>
            <option value="1">Up to 1</option>
            <option value="2">Up to 2</option>
            <option value="any">Any</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="flex">Flexible dates</label>
          <select id="flex" value={form.flexDays} onChange={(e) => onChange({ flexDays: Number(e.target.value) })}>
            <option value={0}>Exact date</option>
            <option value={1}>± 1 day</option>
            <option value={2}>± 2 days</option>
            <option value={3}>± 3 days</option>
            <option value={5}>± 5 days</option>
            <option value={7}>± 7 days</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="sort">Sort by</label>
          <select id="sort" value={form.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <button type="button" className="disclosure" onClick={() => setAdvanced((v) => !v)}>
        {advanced ? "▾" : "▸"} Advanced filters
      </button>

      {advanced && (
        <div className="advanced">
          <div className="grid2">
            <div className="field">
              <label className="field-label" htmlFor="nearby">Include nearby airports</label>
              <select
                id="nearby"
                value={form.nearbyRadiusKm}
                onChange={(e) => onChange({ nearbyRadiusKm: Number(e.target.value) })}
              >
                <option value={0}>Exact airports only</option>
                <option value={100}>Within 100 km</option>
                <option value={200}>Within 200 km</option>
                <option value={350}>Within 350 km</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="maxPrice">Max price</label>
              <input
                id="maxPrice"
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

          <div className="grid2">
            <div className="field">
              <label className="field-label" htmlFor="departAfter">Depart after</label>
              <input
                id="departAfter"
                type="time"
                value={form.departAfter}
                onChange={(e) => onChange({ departAfter: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="departBefore">Depart before</label>
              <input
                id="departBefore"
                type="time"
                value={form.departBefore}
                onChange={(e) => onChange({ departBefore: e.target.value })}
              />
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label className="field-label" htmlFor="maxHours">Max total hours</label>
              <input
                id="maxHours"
                type="number"
                min={1}
                max={72}
                placeholder="any"
                value={form.maxDurationHours ?? ""}
                onChange={(e) =>
                  onChange({ maxDurationHours: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="exclude">Exclude airlines</label>
              <input
                id="exclude"
                type="text"
                placeholder="e.g. SU, PS"
                value={form.excludeAirlines.join(", ")}
                onChange={(e) =>
                  onChange({
                    excludeAirlines: e.target.value
                      .split(",")
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="actions">
        {loading ? (
          <button type="button" className="btn-primary" onClick={onCancel}>
            Cancel search
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={form.origins.length === 0 || form.destinations.length === 0}>
            Search {routeCount} route{routeCount === 1 ? "" : "s"}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onSave} title="Save this search">
          Save
        </button>
      </div>
    </form>
  );
}
