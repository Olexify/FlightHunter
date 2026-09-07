import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Alert, CustomPreset, PricePoint, SavedSearch } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";
import { api, type AlertEvent, type Meta } from "./api";
import { useSearch } from "./hooks/useSearch";
import { useTheme } from "./hooks/useTheme";
import { useSettings } from "./hooks/useSettings";
import {
  defaultForm,
  formFromSearchParams,
  formToRequest,
  formToSearchParams,
  type FormState,
} from "./searchParams";
import { useExplore } from "./hooks/useExplore";
import SearchForm from "./components/SearchForm";
import ExplorePanel, { defaultExploreForm, type ExploreForm } from "./components/ExplorePanel";
import ResultsList from "./components/ResultsList";
import PriceGrid from "./components/PriceGrid";
import PriceHistoryChart from "./components/PriceHistoryChart";
import AlertsPanel from "./components/AlertsPanel";
import SavedSearches from "./components/SavedSearches";
import SettingsPanel from "./components/SettingsPanel";
import ProviderBar from "./components/ProviderBar";

type Tab = "alerts" | "saved" | "history" | "settings";
/** Search knows where you are going; Explore answers where you could go. */
type Mode = "search" | "explore";

export default function App() {
  const { settings, update, updateWeights, reset } = useSettings();

  // Seed from the user's SAVED settings, not the built-in defaults — otherwise
  // a reloaded or shared link silently runs with a different currency, cabin
  // and stop limit than the person's own preferences.
  const [form, setForm] = useState<FormState>(() =>
    formFromSearchParams(window.location.search, settings),
  );
  const [mode, setMode] = useState<Mode>("search");
  const [exploreForm, setExploreForm] = useState<ExploreForm>(() =>
    defaultExploreForm(settings.defaultCurrency),
  );
  const [meta, setMeta] = useState<Meta | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [tab, setTab] = useState<Tab>("alerts");
  const [pinned, setPinned] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { state, run, cancel } = useSearch();
  const explore = useExplore();
  const { theme, setTheme, cycle } = useTheme();

  const patch = useCallback((p: Partial<FormState>) => setForm((f) => ({ ...f, ...p })), []);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ------------------------------ bootstrap ------------------------------ */

  useEffect(() => {
    api.meta().then(setMeta).catch(() => notify("Could not reach the API"));
    void refreshAlerts();
    void refreshSaved();
    void refreshPresets();
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Back/forward should restore the search that link encodes. */
  useEffect(() => {
    const onPop = (): void => setForm(formFromSearchParams(window.location.search, settings));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [settings]);

  /**
   * Result volume is a preference, but the live form carries its own copy so a
   * single search can be widened without changing the default. Push the
   * setting through, otherwise moving the slider appears to do nothing until
   * the next fresh form.
   */
  const perRouteSynced = useRef(false);
  useEffect(() => {
    // Skip the first run: on mount the form already holds whatever the URL
    // encoded, and overwriting it here discarded the `perRoute` value from a
    // shared link before the first search ever ran.
    if (!perRouteSynced.current) {
      perRouteSynced.current = true;
      return;
    }
    setForm((f) => (f.maxPerPair === settings.maxPerPair ? f : { ...f, maxPerPair: settings.maxPerPair }));
  }, [settings.maxPerPair]);

  async function refreshAlerts(): Promise<void> {
    try {
      const data = await api.alertsList();
      setAlerts(data.alerts);
      setEvents(data.events);
    } catch {
      /* panel simply stays empty */
    }
  }

  async function refreshSaved(): Promise<void> {
    try {
      setSaved(await api.savedList());
    } catch {
      /* panel simply stays empty */
    }
  }

  async function refreshPresets(): Promise<void> {
    try {
      setCustomPresets((await api.presets()).custom);
    } catch {
      /* built-in presets still work */
    }
  }

  /* -------------------------------- search -------------------------------- */

  const submit = useCallback(
    (override?: Partial<FormState>) => {
      const next = override ? { ...form, ...override } : form;
      if (override) setForm(next);

      // Mirror the search into the URL so it can be bookmarked and shared.
      const qs = formToSearchParams(next, settings);
      window.history.pushState({}, "", `${window.location.pathname}?${qs}`);

      void run(formToRequest(next, settings.weights));
    },
    [form, run, settings],
  );

  /* Keyboard shortcuts. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape" && state.status === "loading") {
        cancel();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".combo input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, cancel, state.status]);

  const data = state.data;
  const offers = data?.offers ?? [];
  const cheapest = useMemo(
    () => offers.reduce<number | null>((min, o) => (min === null || o.price.total < min ? o.price.total : min), null),
    [offers],
  );

  /* ------------------------------ side actions ---------------------------- */

  const loadHistory = useCallback(async () => {
    const origin = form.origins[0];
    const destination = form.destinations[0];
    if (!origin || !destination) return;
    try {
      setHistory(await api.history(origin, destination));
    } catch {
      setHistory([]);
    }
  }, [form.origins, form.destinations]);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab, loadHistory]);

  const saveSearch = async (): Promise<void> => {
    const name = window.prompt("Name this search", `${form.origins[0] ?? "?"} → ${form.destinations[0] ?? "?"}`);
    if (!name) return;
    try {
      await api.savedCreate(name, formToRequest(form, settings.weights));
      await refreshSaved();
      notify("Search saved");
    } catch {
      notify("Could not save the search");
    }
  };

  const savePreset = async (): Promise<void> => {
    const name = window.prompt(
      "Name this route preset",
      `${form.origins.slice(0, 2).join("/")} → ${form.destinations.slice(0, 2).join("/")}`,
    );
    if (!name) return;
    try {
      await api.presetCreate(name, form.origins, form.destinations);
      await refreshPresets();
      notify("Preset saved");
    } catch {
      notify("Could not save the preset");
    }
  };

  const createAlert = async (input: {
    name: string;
    targetPrice: number | null;
    dropPercent: number | null;
  }): Promise<void> => {
    setBusy(true);
    try {
      // Watch the search that produced the results on screen, not the live
      // form. Editing a field after searching and then clicking "Create alert"
      // would otherwise silently watch a route the user never saw priced.
      const request = state.request ?? formToRequest(form, settings.weights);
      await api.alertCreate({ ...input, request });
      await refreshAlerts();
      notify("Alert created");
    } catch {
      notify("Could not create the alert");
    } finally {
      setBusy(false);
    }
  };

  const pollNow = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.alertsPoll();
      await refreshAlerts();
      notify(`Checked ${r.checked} alert(s), ${r.triggered} triggered`);
    } catch {
      notify("Alert check failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (): Promise<void> => {
    if (!state.request) return;
    try {
      await api.exportCsv(state.request);
    } catch {
      notify("Export failed");
    }
  };

  const runExplore = (): void => {
    void explore.run({
      origins: exploreForm.origins,
      departureDate: exploreForm.departureDate,
      adults: form.adults,
      cabin: form.cabin,
      currency: form.currency,
      regions: exploreForm.regions,
      candidates: exploreForm.candidates,
      minDistanceKm: exploreForm.minDistanceKm,
      sort: exploreForm.sort,
      ...(exploreForm.tripLengthDays !== null ? { tripLengthDays: exploreForm.tripLengthDays } : {}),
      ...(exploreForm.maxPrice !== null ? { maxPrice: exploreForm.maxPrice } : {}),
      ...(exploreForm.maxFlightHours !== null
        ? { maxFlightHours: exploreForm.maxFlightHours }
        : {}),
      ...(exploreForm.maxStops !== null ? { maxStops: exploreForm.maxStops } : {}),
    });
  };

  /** Picking a destination hands it to the full search, dates and all. */
  const openDestination = (result: {
    origin: string;
    destination: { iata: string };
    departureDate: string;
    returnDate?: string;
  }): void => {
    setMode("search");
    submit({
      origins: [result.origin],
      destinations: [result.destination.iata],
      departureDate: result.departureDate,
      returnDate: result.returnDate ?? "",
    });
  };

  /** Clear every advanced filter without disturbing the route or dates. */
  const resetFilters = (): void => {
    const blank = defaultForm(settings);
    patch({
      includeAirlines: [],
      excludeAirlines: [],
      alliances: [],
      fareBrands: [],
      requireCheckedBag: false,
      excludeLowCost: false,
      viaAirports: [],
      avoidAirports: [],
      maxSegments: null,
      avoidRedEye: false,
      departAfter: "",
      departBefore: "",
      arriveAfter: "",
      arriveBefore: "",
      minLayoverMinutes: null,
      maxLayoverMinutes: null,
      maxDurationHours: null,
      maxPrice: null,
      nearbyRadiusKm: 0,
      maxPerPair: blank.maxPerPair,
    });
  };

  const pinnedOffers = offers.filter((o) => pinned.includes(o.id));
  const routeCount = form.origins.length * form.destinations.length;

  /* --------------------------------- view -------------------------------- */

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✈</span>
          <div>
            <h1>Flight Hunter</h1>
            <p className="muted">
              {meta ? `${meta.airports.toLocaleString()} airports worldwide` : "Loading…"}
              {meta?.mockOnly && " · sample data"}
            </p>
          </div>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Search mode">
          {(["search", "explore"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode(m)}
            >
              {m === "search" ? "Search" : "Explore"}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          {mode === "search" && cheapest !== null && (
            <div className="best">
              <span className="muted">Cheapest</span>
              <strong>{formatPrice(cheapest, form.currency)}</strong>
            </div>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={exportCsv}
            disabled={mode !== "search" || offers.length === 0}
          >
            Export CSV
          </button>
          <button type="button" className="btn-ghost" onClick={() => setTab("settings")} title="Settings">
            ⚙
          </button>
          <button type="button" className="btn-ghost" onClick={cycle} title={`Theme: ${theme}`}>
            {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥"}
          </button>
        </div>
      </header>

      {meta?.mockOnly && (
        <div className="banner">
          <strong>Sample data.</strong> No provider keys are configured, so fares are realistic
          simulations rather than bookable prices. Add Amadeus keys to <code>.env</code> for live results.
        </div>
      )}

      <main className={mode === "explore" ? "layout layout-explore" : "layout"}>
        {mode === "search" && (
        <aside className="col-form">
          <SearchForm
            form={form}
            onChange={patch}
            onSubmit={() => submit()}
            onCancel={cancel}
            onSave={saveSearch}
            onResetFilters={resetFilters}
            loading={state.status === "loading"}
            presets={meta?.presets ?? []}
            customPresets={customPresets}
            onSavePreset={savePreset}
            onDeletePreset={async (id) => {
              await api.presetRemove(id);
              await refreshPresets();
            }}
            currencies={meta?.currencies ?? ["EUR", "USD", "GBP"]}
            routeCount={routeCount}
          />
        </aside>
        )}

        <section className="col-results">
          {mode === "explore" ? (
            <ExplorePanel
              form={exploreForm}
              onChange={(p) => setExploreForm((f) => ({ ...f, ...p }))}
              onSubmit={runExplore}
              onCancel={explore.cancel}
              onPickDestination={openDestination}
              loading={explore.state.status === "loading"}
              data={explore.state.data}
              error={explore.state.error}
              currency={form.currency}
            />
          ) : (
          <>
          {state.error && <div className="error-box">{state.error}</div>}

          {data && (
            <>
              <ProviderBar
                providers={data.providers}
                elapsedMs={data.elapsedMs}
                cached={data.cached}
                totalBeforeFilters={data.totalBeforeFilters}
                shown={offers.length}
              />

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

              <PriceGrid
                cells={data.priceGrid}
                selectedDate={form.departureDate}
                onPick={(date) => submit({ departureDate: date })}
              />
            </>
          )}

          {state.status === "loading" && (
            <div className="loading-bar" role="status" aria-live="polite">
              Searching {routeCount} route{routeCount === 1 ? "" : "s"}…
            </div>
          )}

          <ResultsList
            offers={offers}
            pinned={pinned}
            loading={state.status === "loading"}
            settings={settings}
            onTogglePin={(id) =>
              setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
            }
          />
          </>
          )}
        </section>

        <aside className="col-panel">
          <div className="tabs" role="tablist">
            {(["alerts", "saved", "history", "settings"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? "tab active" : "tab"}
                onClick={() => setTab(t)}
              >
                {t === "alerts"
                  ? "Alerts"
                  : t === "saved"
                    ? "Saved"
                    : t === "history"
                      ? "History"
                      : "Settings"}
              </button>
            ))}
          </div>

          {tab === "alerts" && (
            <AlertsPanel
              alerts={alerts}
              events={events}
              currentCheapest={cheapest}
              currency={form.currency}
              canCreate={offers.length > 0}
              busy={busy}
              onCreate={createAlert}
              onToggle={async (id, active) => {
                await api.alertSetActive(id, active);
                await refreshAlerts();
              }}
              onRemove={async (id) => {
                await api.alertRemove(id);
                await refreshAlerts();
              }}
              onPollNow={pollNow}
            />
          )}

          {tab === "saved" && (
            <SavedSearches
              saved={saved}
              onLoad={(f) => {
                patch(f);
                notify("Search loaded");
              }}
              onRemove={async (id) => {
                await api.savedRemove(id);
                await refreshSaved();
              }}
            />
          )}

          {tab === "history" && (
            <div className="panel-body">
              <PriceHistoryChart
                points={history}
                route={`${form.origins[0] ?? "?"} → ${form.destinations[0] ?? "?"}`}
              />
            </div>
          )}

          {tab === "settings" && (
            <SettingsPanel
              settings={settings}
              onChange={update}
              onWeights={updateWeights}
              onReset={reset}
              currencies={meta?.currencies ?? ["EUR", "USD", "GBP"]}
              theme={theme}
              onTheme={setTheme}
            />
          )}
        </aside>
      </main>

      {pinnedOffers.length > 0 && (
        <div className="compare-tray">
          <strong>Comparing {pinnedOffers.length}</strong>
          {pinnedOffers.map((o) => (
            <span key={o.id} className="compare-item">
              {o.origin}→{o.destination} {formatPrice(o.price.total, o.price.currency)}
              <button type="button" onClick={() => setPinned((p) => p.filter((x) => x !== o.id))}>
                ×
              </button>
            </span>
          ))}
          <button type="button" className="btn-link" onClick={() => setPinned([])}>
            Clear
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <footer className="footer muted">
        {meta?.dataLicense}
        <span> · Ctrl/⌘+Enter to search · / to focus · Esc to cancel</span>
      </footer>
    </div>
  );
}
