import type { FlightOffer, ProviderId, SearchRequest } from "@flighthunter/shared";

/** A single origin→destination leg the orchestrator asks a provider to price. */
export interface RoutePair {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
}

export interface ProviderContext {
  /** Aborted when the client disconnects, so upstream work stops too. */
  signal?: AbortSignal;
}

export interface FlightProvider {
  readonly id: ProviderId;
  /** Human label for status reporting. */
  readonly label: string;
  /**
   * False when credentials are missing. Unconfigured providers are skipped
   * rather than attempted-and-failed, keeping the status panel honest.
   */
  isConfigured(): boolean;
  /**
   * Price one pair. May return an empty array — that means "nothing found",
   * not an error. Throw only for genuine failures so the orchestrator can
   * distinguish the two.
   */
  search(pair: RoutePair, request: SearchRequest, ctx: ProviderContext): Promise<FlightOffer[]>;
}
