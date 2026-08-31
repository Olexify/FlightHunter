import type { SavedSearch } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";
import type { FormState } from "../searchParams";

interface Props {
  saved: SavedSearch[];
  onLoad: (form: Partial<FormState>) => void;
  onRemove: (id: string) => void;
}

interface StoredRequest {
  origins?: string[];
  destinations?: string[];
  departureDate?: string;
  returnDate?: string;
  currency?: string;
}

export default function SavedSearches({ saved, onLoad, onRemove }: Props) {
  if (saved.length === 0) {
    return (
      <div className="panel-body">
        <p className="muted">
          Nothing saved yet. Use <strong>Save</strong> under the search form to keep a hunt for later.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <ul className="saved-list">
        {saved.map((s) => {
          // Stored requests are opaque `unknown` on the wire; read defensively
          // so an older saved shape cannot crash the panel.
          const req = (s.request ?? {}) as StoredRequest;
          const origins = req.origins ?? [];
          const destinations = req.destinations ?? [];

          return (
            <li key={s.id}>
              <button
                type="button"
                className="saved-main"
                onClick={() =>
                  onLoad({
                    origins,
                    destinations,
                    ...(req.departureDate ? { departureDate: req.departureDate } : {}),
                    returnDate: req.returnDate ?? "",
                    ...(req.currency ? { currency: req.currency } : {}),
                  })
                }
              >
                <strong>{s.name}</strong>
                <div className="muted">
                  {origins.join(", ") || "?"} → {destinations.join(", ") || "?"}
                </div>
                <div className="muted">
                  {req.departureDate ?? "—"}
                  {s.lastCheapest !== null &&
                    ` · last ${formatPrice(s.lastCheapest, req.currency ?? "EUR")}`}
                </div>
              </button>
              <button type="button" className="btn-link danger" onClick={() => onRemove(s.id)}>
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
