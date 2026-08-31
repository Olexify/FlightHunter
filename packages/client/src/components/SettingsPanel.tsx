import type { CabinClass, SortKey } from "@flighthunter/shared";
import type { Settings } from "../hooks/useSettings";
import type { Theme } from "../hooks/useTheme";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onWeights: (patch: Partial<Settings["weights"]>) => void;
  onReset: () => void;
  currencies: string[];
  theme: Theme;
  onTheme: (t: Theme) => void;
}

const CABINS: Array<[CabinClass, string]> = [
  ["ECONOMY", "Economy"],
  ["PREMIUM_ECONOMY", "Premium economy"],
  ["BUSINESS", "Business"],
  ["FIRST", "First"],
];

const SORTS: Array<[SortKey, string]> = [
  ["best", "Best value"],
  ["price", "Cheapest"],
  ["duration", "Fastest"],
  ["stops", "Fewest stops"],
  ["departure", "Departure time"],
  ["arrival", "Arrival time"],
];

/** Labelled slider that shows its live value. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="setting">
      <div className="setting-head">
        <label>{label}</label>
        <span className="setting-value">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="muted"> — {hint}</span>}
      </span>
    </label>
  );
}

export default function SettingsPanel({
  settings,
  onChange,
  onWeights,
  onReset,
  currencies,
  theme,
  onTheme,
}: Props) {
  const w = settings.weights;

  return (
    <div className="panel-body settings">
      <section>
        <h4>Ranking — what "best value" means</h4>
        <p className="muted">
          Each is a penalty per unit of excess over the best option found. Raise price to hunt
          bargains; raise duration to favour short trips.
        </p>

        <Slider
          label="Price sensitivity"
          value={w.price}
          min={0}
          max={1}
          step={0.05}
          onChange={(price) => onWeights({ price })}
        />
        <Slider
          label="Duration sensitivity"
          value={w.duration}
          min={0}
          max={1}
          step={0.05}
          onChange={(duration) => onWeights({ duration })}
        />
        <Slider
          label="Penalty per stop"
          value={w.stops}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(stops) => onWeights({ stops })}
          hint="0.08 means one connection is worth about an 8% price rise."
        />
      </section>

      <section>
        <h4>Result volume</h4>
        <div className="setting">
          <div className="setting-head">
            <label htmlFor="perRoute">Offers per route</label>
            <span className="setting-value">{settings.maxPerPair}</span>
          </div>
          <input
            id="perRoute"
            type="range"
            min={3}
            max={120}
            step={3}
            value={settings.maxPerPair}
            onChange={(e) => onChange({ maxPerPair: Number(e.target.value) })}
          />
          <p className="muted">
            Higher means more prices per route and a slower search. Each flight is offered in up to
            three fare families.
          </p>
        </div>

        <div className="setting">
          <div className="setting-head">
            <label htmlFor="perPage">Results shown per page</label>
            <span className="setting-value">{settings.resultsPerPage}</span>
          </div>
          <input
            id="perPage"
            type="range"
            min={10}
            max={200}
            step={5}
            value={settings.resultsPerPage}
            onChange={(e) => onChange({ resultsPerPage: Number(e.target.value) })}
          />
        </div>
      </section>

      <section>
        <h4>Search defaults</h4>
        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="dCurrency">Currency</label>
            <select
              id="dCurrency"
              value={settings.defaultCurrency}
              onChange={(e) => onChange({ defaultCurrency: e.target.value })}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="dCabin">Cabin</label>
            <select
              id="dCabin"
              value={settings.defaultCabin}
              onChange={(e) => onChange({ defaultCabin: e.target.value as CabinClass })}
            >
              {CABINS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="dAdults">Adults</label>
            <input
              id="dAdults"
              type="number"
              min={1}
              max={9}
              value={settings.defaultAdults}
              onChange={(e) => onChange({ defaultAdults: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="dStops">Max stops</label>
            <select
              id="dStops"
              value={settings.defaultMaxStops === null ? "any" : String(settings.defaultMaxStops)}
              onChange={(e) =>
                onChange({
                  defaultMaxStops: e.target.value === "any" ? null : Number(e.target.value),
                })
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
            <label className="field-label" htmlFor="dFlex">Flexible dates</label>
            <select
              id="dFlex"
              value={settings.defaultFlexDays}
              onChange={(e) => onChange({ defaultFlexDays: Number(e.target.value) })}
            >
              <option value={0}>Exact date</option>
              <option value={1}>± 1 day</option>
              <option value={2}>± 2 days</option>
              <option value={3}>± 3 days</option>
              <option value={5}>± 5 days</option>
              <option value={7}>± 7 days</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="dSort">Sort by</label>
            <select
              id="dSort"
              value={settings.defaultSort}
              onChange={(e) => onChange({ defaultSort: e.target.value as SortKey })}
            >
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h4>Appearance</h4>
        <div className="field">
          <label className="field-label" htmlFor="theme">Theme</label>
          <select id="theme" value={theme} onChange={(e) => onTheme(e.target.value as Theme)}>
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="density">Density</label>
          <select
            id="density"
            value={settings.density}
            onChange={(e) => onChange({ density: e.target.value as Settings["density"] })}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact — more rows on screen</option>
          </select>
        </div>

        <Toggle
          label="Best-value score"
          checked={settings.showScore}
          onChange={(showScore) => onChange({ showScore })}
        />
        <Toggle
          label="Baggage allowance"
          checked={settings.showBaggage}
          onChange={(showBaggage) => onChange({ showBaggage })}
        />
        <Toggle
          label="CO₂ estimate"
          checked={settings.showCo2}
          onChange={(showCo2) => onChange({ showCo2 })}
        />
        <Toggle
          label="Seats remaining"
          checked={settings.showSeatsLeft}
          onChange={(showSeatsLeft) => onChange({ showSeatsLeft })}
        />
        <Toggle
          label="Collapse fare families"
          checked={settings.groupFareBrands}
          onChange={(groupFareBrands) => onChange({ groupFareBrands })}
          hint="show only the cheapest fare per flight"
        />
      </section>

      <button type="button" className="btn-ghost" onClick={onReset}>
        Reset all settings
      </button>
    </div>
  );
}
