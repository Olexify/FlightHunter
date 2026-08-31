import type { ProviderId } from "@flighthunter/shared";
import { AmadeusProvider } from "./amadeus.js";
import { MockProvider } from "./mock.js";
import { TravelpayoutsProvider } from "./travelpayouts.js";
import type { FlightProvider } from "./types.js";

/**
 * Providers in priority order. Adding a source means implementing
 * `FlightProvider` and appending it here — nothing else in the app changes.
 */
const ALL: FlightProvider[] = [
  new AmadeusProvider(),
  new TravelpayoutsProvider(),
  new MockProvider(),
];

/**
 * The live providers for a search.
 *
 * When any real source is configured the mock is withheld, so sample fares can
 * never be silently mixed into real results. With no keys at all, mock is the
 * only provider and the response says so explicitly.
 */
export function activeProviders(): FlightProvider[] {
  const configured = ALL.filter((p) => p.id !== "mock" && p.isConfigured());
  if (configured.length > 0) return configured;

  const mock = ALL.find((p) => p.id === "mock");
  return mock ? [mock] : [];
}

export function allProviders(): FlightProvider[] {
  return [...ALL];
}

export function getProvider(id: ProviderId): FlightProvider | undefined {
  return ALL.find((p) => p.id === id);
}

/** True when results will be sample data rather than real fares. */
export function isMockOnly(): boolean {
  return activeProviders().every((p) => p.id === "mock");
}
