import { useState } from "react";
import type { Alert } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";
import type { AlertEvent } from "../api";

interface Props {
  alerts: Alert[];
  events: AlertEvent[];
  currentCheapest: number | null;
  currency: string;
  canCreate: boolean;
  busy: boolean;
  onCreate: (input: { name: string; targetPrice: number | null; dropPercent: number | null }) => void;
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
  onPollNow: () => void;
}

export default function AlertsPanel({
  alerts,
  events,
  currentCheapest,
  currency,
  canCreate,
  busy,
  onCreate,
  onToggle,
  onRemove,
  onPollNow,
}: Props) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [drop, setDrop] = useState("10");
  const [mode, setMode] = useState<"target" | "drop">("drop");

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = name.trim() || "Price watch";
    onCreate({
      name: trimmed,
      targetPrice: mode === "target" && target ? Number(target) : null,
      dropPercent: mode === "drop" && drop ? Number(drop) : null,
    });
    setName("");
    setTarget("");
  };

  return (
    <div className="panel-body">
      {events.length > 0 && (
        <section className="alert-events">
          <h4>Recent drops</h4>
          {events.slice(0, 5).map((ev) => (
            <div key={ev.id} className="alert-event">
              <span className="alert-dot" />
              <div>
                <div>{ev.message}</div>
                <div className="muted">{ev.createdAt.slice(0, 16).replace("T", " ")}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      <form className="alert-form" onSubmit={submit}>
        <h4>Watch this search</h4>

        {!canCreate ? (
          <p className="muted">Run a search first, then you can watch it for price drops.</p>
        ) : (
          <>
            <input
              type="text"
              placeholder="Name (e.g. Japan October)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={mode === "drop"}
                  onChange={() => setMode("drop")}
                />
                Drops by
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={drop}
                disabled={mode !== "drop"}
                onChange={(e) => setDrop(e.target.value)}
                className="tiny"
              />
              <span className="muted">%</span>
            </div>

            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={mode === "target"}
                  onChange={() => setMode("target")}
                />
                Falls below
              </label>
              <input
                type="number"
                min={1}
                placeholder={currentCheapest ? String(Math.round(currentCheapest * 0.85)) : "600"}
                value={target}
                disabled={mode !== "target"}
                onChange={(e) => setTarget(e.target.value)}
                className="tiny"
              />
              <span className="muted">{currency}</span>
            </div>

            {currentCheapest !== null && (
              <p className="muted">
                Current cheapest: {formatPrice(currentCheapest, currency)}
              </p>
            )}

            <button type="submit" className="btn-primary small" disabled={busy}>
              Create alert
            </button>
          </>
        )}
      </form>

      <section>
        <div className="panel-section-head">
          <h4>Active alerts ({alerts.length})</h4>
          {alerts.length > 0 && (
            <button type="button" className="btn-link" onClick={onPollNow} disabled={busy}>
              Check now
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <p className="muted">No alerts yet.</p>
        ) : (
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.id} className={a.active ? "" : "inactive"}>
                <div className="alert-main">
                  <strong>{a.name}</strong>
                  <div className="muted">
                    {a.targetPrice !== null && `Target ${formatPrice(a.targetPrice, a.currency)}`}
                    {a.targetPrice !== null && a.dropPercent !== null && " · "}
                    {a.dropPercent !== null && `Drop ${a.dropPercent}%`}
                  </div>
                  <div className="muted">
                    {a.lastPrice !== null
                      ? `Last seen ${formatPrice(a.lastPrice, a.currency)}`
                      : "Not checked yet"}
                    {a.triggeredAt && " · triggered"}
                  </div>
                </div>
                <div className="alert-actions">
                  <button type="button" className="btn-link" onClick={() => onToggle(a.id, !a.active)}>
                    {a.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className="btn-link danger" onClick={() => onRemove(a.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
