import type {
  AirlineInfo,
  Airport,
  Alert,
  CustomPreset,
  ExploreRequestInput,
  ExploreResponse,
  PricePoint,
  RoutePreset,
  SavedSearch,
  SearchRequestInput,
  SearchResponse,
} from "@flighthunter/shared";

/** Shape the server sends on failure. */
interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "UNKNOWN",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    // AbortError must stay abortable so callers can ignore superseded requests.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Cannot reach the API — is the server running on port 4000?", "OFFLINE");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const envelope = body as ErrorEnvelope | null;
    throw new ApiError(
      res.status,
      envelope?.error?.message ?? `Request failed (${res.status})`,
      envelope?.error?.code ?? "UNKNOWN",
      envelope?.error?.details,
    );
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface ProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  active: boolean;
}

export interface Meta {
  providers: ProviderInfo[];
  mockOnly: boolean;
  warnings: string[];
  presets: RoutePreset[];
  currencies: string[];
  airlines: AirlineInfo[];
  airports: number;
  dataLicense: string;
}

export const api = {
  meta: () => call<Meta>("/meta"),

  presets: () => call<{ builtIn: RoutePreset[]; custom: CustomPreset[] }>("/presets"),
  presetCreate: (name: string, origins: string[], destinations: string[]) =>
    call<{ preset: CustomPreset }>("/presets", json({ name, origins, destinations })).then(
      (r) => r.preset,
    ),
  presetRemove: (id: string) => call<void>(`/presets/${id}`, { method: "DELETE" }),

  airports: (q: string, limit = 8, signal?: AbortSignal) =>
    call<{ airports: Airport[] }>(
      `/airports?q=${encodeURIComponent(q)}&limit=${limit}`,
      signal ? { signal } : undefined,
    ).then((r) => r.airports),

  airport: (iata: string) => call<{ airport: Airport }>(`/airports/${iata}`).then((r) => r.airport),

  search: (body: SearchRequestInput, signal?: AbortSignal) =>
    call<SearchResponse>("/search", { ...json(body), ...(signal ? { signal } : {}) }),

  explore: (body: ExploreRequestInput, signal?: AbortSignal) =>
    call<ExploreResponse>("/explore", { ...json(body), ...(signal ? { signal } : {}) }),

  /** Triggers a browser download of the current result set as CSV. */
  async exportCsv(body: SearchRequestInput): Promise<void> {
    const res = await fetch("/api/search/export", json(body));
    if (!res.ok) throw new ApiError(res.status, "Export failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flighthunter-${body.departureDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick; revoking synchronously can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  savedList: () => call<{ saved: SavedSearch[] }>("/saved").then((r) => r.saved),
  savedCreate: (name: string, request: SearchRequestInput) =>
    call<{ saved: SavedSearch }>("/saved", json({ name, request })).then((r) => r.saved),
  savedRemove: (id: string) => call<void>(`/saved/${id}`, { method: "DELETE" }),

  alertsList: () =>
    call<{ alerts: Alert[]; events: AlertEvent[] }>("/alerts"),
  alertCreate: (input: {
    name: string;
    request: SearchRequestInput;
    targetPrice: number | null;
    dropPercent: number | null;
  }) => call<{ alert: Alert }>("/alerts", json(input)).then((r) => r.alert),
  alertSetActive: (id: string, active: boolean) =>
    call<{ alert: Alert }>(`/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    }),
  alertRemove: (id: string) => call<void>(`/alerts/${id}`, { method: "DELETE" }),
  alertsPoll: () =>
    call<{ checked: number; triggered: number; failed: number }>("/alerts/poll", { method: "POST" }),
  alertsAcknowledge: () => call<{ acknowledged: number }>("/alerts/acknowledge", { method: "POST" }),

  history: (origin: string, destination: string, departureDate?: string) => {
    const params = new URLSearchParams({ origin, destination });
    if (departureDate) params.set("departureDate", departureDate);
    return call<{ points: PricePoint[] }>(`/history?${params}`).then((r) => r.points);
  },
};

export interface AlertEvent {
  id: number;
  alertId: string;
  price: number;
  previousPrice: number | null;
  currency: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}
