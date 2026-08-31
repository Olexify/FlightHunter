import { useCallback, useEffect, useState } from "react";
import type { CabinClass, RankingWeights, SortKey } from "@flighthunter/shared";
import { DEFAULT_RANKING_WEIGHTS } from "@flighthunter/shared";

/**
 * Persisted user preferences. These seed every new search and control how
 * results are displayed and ranked, so the app can be tuned to how someone
 * actually shops for flights rather than to one fixed opinion.
 */
export interface Settings {
  /* Defaults applied to a fresh search */
  defaultCurrency: string;
  defaultCabin: CabinClass;
  defaultAdults: number;
  defaultMaxStops: number | null;
  defaultFlexDays: number;
  defaultSort: SortKey;
  /** Offers requested per route — the main lever on result volume. */
  maxPerPair: number;

  /* Ranking */
  weights: RankingWeights;

  /* Display */
  density: "comfortable" | "compact";
  resultsPerPage: number;
  showCo2: boolean;
  showBaggage: boolean;
  showScore: boolean;
  showSeatsLeft: boolean;
  groupFareBrands: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCurrency: "EUR",
  defaultCabin: "ECONOMY",
  defaultAdults: 1,
  defaultMaxStops: 2,
  defaultFlexDays: 0,
  defaultSort: "best",
  maxPerPair: 24,

  weights: DEFAULT_RANKING_WEIGHTS,

  density: "comfortable",
  resultsPerPage: 25,
  showCo2: true,
  showBaggage: true,
  showScore: true,
  showSeatsLeft: true,
  groupFareBrands: false,
};

const STORAGE_KEY = "fh.settings.v1";

function read(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge over defaults so a settings file written by an older build, or a
    // partially corrupted one, never leaves a field undefined.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      weights: { ...DEFAULT_RANKING_WEIGHTS, ...(parsed.weights ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Blocked storage — preferences simply will not survive a reload.
    }
    document.documentElement.setAttribute("data-density", settings.density);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const updateWeights = useCallback((patch: Partial<RankingWeights>) => {
    setSettings((s) => ({ ...s, weights: { ...s.weights, ...patch } }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, updateWeights, reset };
}
