import { useState } from "react";
import type { Baggage, FlightOffer, Itinerary } from "@flighthunter/shared";
import {
  co2AsCarKm,
  FARE_BRAND_LABELS,
  formatDuration,
  formatLocalDateTime,
  formatLocalTime,
  formatPrice,
} from "@flighthunter/shared";
import type { Settings } from "../hooks/useSettings";

interface Props {
  offer: FlightOffer;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  isCheapest: boolean;
  isFastest: boolean;
  settings: Settings;
  /** Other fare families for the same flight, when collapsing is on. */
  siblings?: FlightOffer[];
  onPickSibling?: (id: string) => void;
}

/** "1 bag · 23kg" / "Cabin bag only" / "No bags". */
function baggageLabel(b: Baggage): string {
  if (b.checkedBags > 0) {
    const kg = b.checkedKg ? ` · ${b.checkedKg}kg` : "";
    return `${b.checkedBags} checked bag${b.checkedBags === 1 ? "" : "s"}${kg}`;
  }
  return b.carryOnIncluded ? "Cabin bag only" : "No bags included";
}

/** Renders one directional leg with its own duration and stop count. */
function Leg({ itinerary }: { itinerary: Itinerary }) {
  const stopLabel =
    itinerary.stops === 0 ? "Direct" : `${itinerary.stops} stop${itinerary.stops === 1 ? "" : "s"}`;

  const via =
    itinerary.segments.length > 1
      ? itinerary.segments.slice(0, -1).map((s) => s.to).join(", ")
      : null;

  return (
    <div className="leg">
      <div className="leg-dir">{itinerary.direction === "outbound" ? "Out" : "Return"}</div>

      <div className="leg-times">
        <span className="leg-time">{formatLocalTime(itinerary.departureAt)}</span>
        <span className="leg-line">
          <span className="leg-dot" />
          <span className="leg-bar" />
          <span className="leg-dot" />
        </span>
        <span className="leg-time">{formatLocalTime(itinerary.arrivalAt)}</span>
      </div>

      <div className="leg-meta">
        <span>{formatDuration(itinerary.durationMinutes)}</span>
        <span className={itinerary.stops === 0 ? "tag tag-direct" : "tag"}>{stopLabel}</span>
        {via && <span className="muted">via {via}</span>}
      </div>

      <div className="leg-date muted">{formatLocalDateTime(itinerary.departureAt).slice(0, 6)}</div>
    </div>
  );
}

export default function FlightCard({
  offer,
  pinned,
  onTogglePin,
  isCheapest,
  isFastest,
  settings,
  siblings,
  onPickSibling,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <article className={pinned ? "offer offer-pinned" : "offer"}>
      <header className="offer-head">
        <div className="offer-route">
          <strong>{offer.origin}</strong>
          <span aria-hidden="true"> → </span>
          <strong>{offer.destination}</strong>
          <div className="offer-airlines muted">
            {offer.airlines.map((a) => `${a.name} (${a.code})`).join(", ") || "Airline not listed"}
          </div>
        </div>

        <div className="offer-badges">
          {isCheapest && <span className="badge badge-good">Cheapest</span>}
          {isFastest && <span className="badge badge-fast">Fastest</span>}
          {offer.fareBrand && (
            <span className={`badge badge-brand brand-${offer.fareBrand.toLowerCase()}`}>
              {FARE_BRAND_LABELS[offer.fareBrand]}
            </span>
          )}
          {settings.showScore && offer.score !== undefined && (
            <span className="badge badge-score" title="Composite score: price, duration and stops">
              {offer.score.toFixed(0)}
            </span>
          )}
          <span className={`badge badge-src badge-${offer.provider}`}>{offer.provider}</span>
        </div>

        <div className="offer-price">
          <div className="price">{formatPrice(offer.price.total, offer.price.currency)}</div>
          {settings.showSeatsLeft && offer.seatsRemaining !== undefined && offer.seatsRemaining <= 4 && (
            <div className="scarce">only {offer.seatsRemaining} left</div>
          )}
        </div>
      </header>

      {/* Fare attributes, the part that explains price differences. */}
      <div className="offer-attrs">
        {settings.showBaggage && offer.baggage && (
          <span className={offer.baggage.checkedBags > 0 ? "attr attr-ok" : "attr"}>
            🧳 {baggageLabel(offer.baggage)}
          </span>
        )}
        {offer.refundable && <span className="attr attr-ok">↩ Refundable</span>}
        {offer.changeable && !offer.refundable && <span className="attr">↻ Changeable</span>}
        {settings.showCo2 && offer.co2Kg !== undefined && offer.co2Kg > 0 && (
          <span className="attr" title={`About the same as driving ${co2AsCarKm(offer.co2Kg)} km`}>
            🌱 {offer.co2Kg} kg CO₂
          </span>
        )}
        {offer.distanceKm !== undefined && offer.distanceKm > 0 && (
          <span className="attr muted">{offer.distanceKm.toLocaleString()} km flown</span>
        )}
      </div>

      <div className="offer-legs">
        {offer.itineraries.map((it) => (
          <Leg key={it.direction} itinerary={it} />
        ))}
      </div>

      {/* Other fare families for this exact flight. */}
      {siblings && siblings.length > 0 && (
        <div className="fare-row">
          <span className="muted">Other fares:</span>
          {siblings.map((s) => (
            <button
              key={s.id}
              type="button"
              className="fare-chip"
              onClick={() => onPickSibling?.(s.id)}
              title={s.baggage ? baggageLabel(s.baggage) : undefined}
            >
              {s.fareBrand ? FARE_BRAND_LABELS[s.fareBrand] : "Fare"}{" "}
              <strong>{formatPrice(s.price.total, s.price.currency)}</strong>
            </button>
          ))}
        </div>
      )}

      <footer className="offer-foot">
        <button type="button" className="btn-link" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide details" : "Show details"}
        </button>

        <button
          type="button"
          className={pinned ? "btn-link pinned" : "btn-link"}
          onClick={() => onTogglePin(offer.id)}
        >
          {pinned ? "★ Pinned" : "☆ Pin to compare"}
        </button>

        <span className="grow" />

        <span className="muted total-time">Total travel {formatDuration(offer.totalDurationMinutes)}</span>

        {offer.deepLink && (
          <a className="btn-book" href={offer.deepLink} target="_blank" rel="noreferrer noopener">
            Book ↗
          </a>
        )}
      </footer>

      {open && (
        <div className="offer-detail">
          {offer.itineraries.map((it) => (
            <section key={it.direction}>
              <h4>{it.direction === "outbound" ? "Outbound" : "Return"}</h4>

              {it.segments.length === 0 ? (
                <p className="muted">
                  This provider returns fares without routing detail, so individual flights are not
                  available.
                </p>
              ) : (
                <ol className="segments">
                  {it.segments.map((s, i) => (
                    <li key={`${s.from}-${s.to}-${i}`}>
                      <div className="seg-main">
                        <strong>
                          {s.from} → {s.to}
                        </strong>
                        <span className="muted">
                          {s.carrierName} {s.carrierCode}
                          {s.flightNumber ?? ""}
                        </span>
                      </div>
                      <div className="seg-times muted">
                        {formatLocalDateTime(s.departureAt)} → {formatLocalDateTime(s.arrivalAt)} ·{" "}
                        {formatDuration(s.durationMinutes)}
                        {s.aircraft ? ` · ${s.aircraft}` : ""}
                      </div>
                      {s.layoverMinutes !== undefined && (
                        <div className={s.layoverMinutes < 60 ? "layover tight" : "layover"}>
                          {formatDuration(s.layoverMinutes)} layover in {s.to}
                          {s.layoverMinutes < 60 ? " — tight connection" : ""}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}

          {offer.warnings?.map((w) => (
            <p key={w} className="warning">
              {w}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
