import type { AirportInfo } from "../types";
import MultiSelect from "./MultiSelect";

interface Props {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate: string;
  currency: string;
  adults: number;
  maxStops: number;
  europeAirports: AirportInfo[];
  japanAirports: AirportInfo[];
  loading: boolean;
  onOriginsChange: (v: string[]) => void;
  onDestinationsChange: (v: string[]) => void;
  onDepartureDateChange: (v: string) => void;
  onReturnDateChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onAdultsChange: (v: number) => void;
  onMaxStopsChange: (v: number) => void;
  onSearch: () => void;
}

export default function SearchPanel(p: Props) {
  return (
    <div className="search-panel">
      <h2>🔍 Search Controls</h2>

      <MultiSelect label="Origins — Europe/Turkey" items={p.europeAirports} selected={p.origins} onChange={p.onOriginsChange} />
      <MultiSelect label="Destinations — Japan" items={p.japanAirports} selected={p.destinations} onChange={p.onDestinationsChange} />

      <div className="grid2">
        <div className="field">
          <label className="field-label">Departure date</label>
          <input type="date" value={p.departureDate} onChange={(e) => p.onDepartureDateChange(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Return (optional)</label>
          <input type="date" value={p.returnDate} onChange={(e) => p.onReturnDateChange(e.target.value)} />
        </div>
      </div>

      <div className="grid3">
        <div className="field">
          <label className="field-label">Currency</label>
          <select value={p.currency} onChange={(e) => p.onCurrencyChange(e.target.value)}>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="UAH">UAH</option>
            <option value="PLN">PLN</option>
            <option value="JPY">JPY</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Adults</label>
          <input type="number" min={1} max={9} value={p.adults} onChange={(e) => p.onAdultsChange(+e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Max stops</label>
          <select value={p.maxStops} onChange={(e) => p.onMaxStopsChange(+e.target.value)}>
            <option value={0}>Direct only</option>
            <option value={1}>Up to 1</option>
            <option value={2}>Up to 2</option>
            <option value={9}>Any</option>
          </select>
        </div>
      </div>

      <button className="search-button" disabled={p.loading} onClick={p.onSearch}>
        {p.loading ? "Scanning all routes…" : `Search ${p.origins.length} × ${p.destinations.length} routes`}
      </button>
    </div>
  );
}