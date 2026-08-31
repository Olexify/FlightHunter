import { useMemo, useState } from "react";
import type { CabinClass, CustomPreset, RoutePreset, SortKey } from "@flighthunter/shared";
import { todayPlus } from "@flighthunter/shared";
import type { FormState } from "../searchParams";
import AirportPicker from "./AirportPicker";
import AdvancedFilters from "./AdvancedFilters";
import PresetPicker from "./PresetPicker";

interface Props {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onResetFilters: () => void;
  loading: boolean;
  presets: RoutePreset[];
  customPresets: CustomPreset[];
  onSavePreset: () => void;
  onDeletePreset: (id: string) => void;
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
  onResetFilters,
  loading,
  presets,
  customPresets,
  onSavePreset,
  onDeletePreset,
  currencies,
  routeCount,
}: Props) {
  const [advanced, setAdvanced] = useState(false);

  /** How many advanced filters are actually narrowing the search. */
  const activeFilters = useMemo(() => {
    let n = 0;
    if (form.includeAirlines.length) n++;
    if (form.excludeAirlines.length) n++;
    if (form.alliances.length) n++;
    if (form.fareBrands.length) n++;
    if (form.requireCheckedBag) n++;
    if (form.excludeLowCost) n++;
    if (form.viaAirports.length) n++;
    if (form.avoidAirports.length) n++;
    if (form.maxSegments !== null) n++;
    if (form.avoidRedEye) n++;
    if (form.departAfter || form.departBefore) n++;
    if (form.arriveAfter || form.arriveBefore) n++;
    if (form.minLayoverMinutes !== null || form.maxLayoverMinutes !== null) n++;
    if (form.maxDurationHours !== null) n++;
    if (form.maxPrice !== null) n++;
    if (form.nearbyRadiusKm > 0) n++;
    return n;
  }, [form]);

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
      <PresetPicker
        builtIn={presets}
        custom={customPresets}
        canSave={form.origins.length > 0 && form.destinations.length > 0}
        onApply={(origins, destinations) => onChange({ origins, destinations })}
        onSaveCurrent={onSavePreset}
        onDeleteCustom={onDeletePreset}
      />

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
          <label className="field-label" htmlFor="children">Children</label>
          <input
            id="children"
            type="number"
            min={0}
            max={8}
            value={form.children}
            onChange={(e) => onChange({ children: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="infants">Infants</label>
          <input
            id="infants"
            type="number"
            min={0}
            max={8}
            value={form.infants}
            onChange={(e) => onChange({ infants: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>

      <div className="grid3">
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
      </div>

      <div className="grid2">
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

      <div className="adv-head">
        <button type="button" className="disclosure" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? "▾" : "▸"} Advanced filters
          {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
        </button>
        {activeFilters > 0 && (
          <button type="button" className="btn-link" onClick={onResetFilters}>
            Clear
          </button>
        )}
      </div>

      {advanced && <AdvancedFilters form={form} onChange={onChange} />}

      <div className="actions">
        {loading ? (
          <button type="button" className="btn-primary" onClick={onCancel}>
            Cancel search
          </button>
        ) : (
          <button
            type="submit"
            className="btn-primary"
            disabled={form.origins.length === 0 || form.destinations.length === 0}
          >
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
