import { useEffect, useState } from "react";
import { fetchPresets, searchFlights } from "./api";
import type { Flight, AirportInfo } from "./types";
import SearchPanel from "./components/SearchPanel";
import ResultsTable from "./components/ResultsTable";

function todayPlus(d: number) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); }

export default function App() {
  const [europeAirports, setEuropeAirports] = useState<AirportInfo[]>([]);
  const [japanAirports, setJapanAirports] = useState<AirportInfo[]>([]);
  const [origins, setOrigins] = useState(["IST", "BUD", "WAW", "PRG", "VIE"]);
  const [destinations, setDestinations] = useState(["NRT", "HND", "KIX"]);
  const [departureDate, setDepartureDate] = useState(todayPlus(30));
  const [returnDate, setReturnDate] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [adults, setAdults] = useState(1);
  const [maxStops, setMaxStops] = useState(2);
  const [loading, setLoading] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchPresets().then((p) => { setEuropeAirports(p.europeOrigins); setJapanAirports(p.japanDestinations); });
  }, []);

  const run = async () => {
    setLoading(true); setErrors([]);
    try {
      const res = await searchFlights({
        origins, destinations, departureDate,
        returnDate: returnDate || undefined,
        adults, maxStops, currency,
      });
      setFlights(res.flights);
      setErrors(res.errors || []);
    } catch (e: any) { setErrors([e.message]); }
    finally { setLoading(false); }
  };

  const cheapest = flights[0];

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">Europe → Japan multi-origin hunter</div>
          <h1>✈️ Flight Hunter</h1>
          <p>Search {origins.length} European airports × {destinations.length} Japanese airports simultaneously. Sort ruthlessly. Find the cheapest route.</p>
        </div>
        {cheapest && (
          <div className="best-card">
            <div className="best-label">Current cheapest</div>
            <div className="best-price">{cheapest.price} {cheapest.currency}</div>
            <div>{cheapest.origin} → {cheapest.destination}</div>
            <div className="muted">{cheapest.airlines.join(", ")} · {cheapest.stops} stop(s)</div>
          </div>
        )}
      </header>

      <main className="layout">
        <section className="panel">
          <SearchPanel
            origins={origins} destinations={destinations}
            departureDate={departureDate} returnDate={returnDate}
            currency={currency} adults={adults} maxStops={maxStops}
            europeAirports={europeAirports} japanAirports={japanAirports}
            loading={loading}
            onOriginsChange={setOrigins} onDestinationsChange={setDestinations}
            onDepartureDateChange={setDepartureDate} onReturnDateChange={setReturnDate}
            onCurrencyChange={setCurrency} onAdultsChange={setAdults}
            onMaxStopsChange={setMaxStops} onSearch={run}
          />
        </section>

        <section className="results-section">
          {errors.length > 0 && (
            <details className="errors"><summary>Messages ({errors.length})</summary><pre>{errors.join("\n")}</pre></details>
          )}
          {loading ? <div className="loading">Scanning {origins.length * destinations.length} route combinations…</div> : <ResultsTable flights={flights} />}
        </section>
      </main>
    </div>
  );
}