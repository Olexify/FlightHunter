import { useMemo } from "react";
import type { PricePoint } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";

interface Props {
  points: PricePoint[];
  route: string;
}

const W = 620;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

/**
 * Hand-rolled SVG line chart. A charting library would add megabytes for one
 * view; this is ~80 lines, scales to the container and themes with CSS vars.
 */
export default function PriceHistoryChart({ points, route }: Props) {
  const model = useMemo(() => {
    if (points.length < 2) return null;

    const sorted = [...points].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const values = sorted.map((p) => p.price);

    const min = Math.min(...values);
    const max = Math.max(...values);
    // Pad the range so a flat line does not sit exactly on the axis.
    const lo = min === max ? min * 0.95 : min - (max - min) * 0.1;
    const hi = min === max ? max * 1.05 : max + (max - min) * 0.1;
    const span = Math.max(1, hi - lo);

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const xy = sorted.map((p, i) => {
      const x = PAD.left + (sorted.length === 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW);
      const y = PAD.top + innerH - ((p.price - lo) / span) * innerH;
      return { x, y, point: p };
    });

    const line = xy.map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");
    const area = `${line} L${xy[xy.length - 1]?.x.toFixed(1)},${PAD.top + innerH} L${xy[0]?.x.toFixed(1)},${PAD.top + innerH} Z`;

    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const change = latest && first ? latest.price - first.price : 0;

    return { sorted, xy, line, area, lo, hi, min, max, latest, first, change, innerH };
  }, [points]);

  if (!model) {
    return (
      <div className="empty small">
        Not enough history for {route} yet — prices are recorded each time you search.
      </div>
    );
  }

  const currency = model.latest?.currency ?? "EUR";
  const ticks = [model.hi, (model.hi + model.lo) / 2, model.lo];

  return (
    <div className="chart">
      <div className="chart-head">
        <div>
          <strong>{route}</strong>
          <span className="muted"> · {model.sorted.length} observations</span>
        </div>
        <div className={model.change <= 0 ? "delta down" : "delta up"}>
          {model.change <= 0 ? "▼" : "▲"} {formatPrice(Math.abs(model.change), currency)}
          <span className="muted"> since first seen</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`Price history for ${route}`}>
        {ticks.map((t, i) => {
          const y = PAD.top + model.innerH - ((t - model.lo) / Math.max(1, model.hi - model.lo)) * model.innerH;
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className="chart-grid" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="chart-label">
                {Math.round(t)}
              </text>
            </g>
          );
        })}

        <path d={model.area} className="chart-area" />
        <path d={model.line} className="chart-line" />

        {model.xy.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={3} className="chart-dot">
            <title>
              {d.point.observedAt.slice(0, 16).replace("T", " ")} — {formatPrice(d.point.price, d.point.currency)}
            </title>
          </circle>
        ))}

        <text x={PAD.left} y={H - 8} className="chart-label">
          {model.first?.observedAt.slice(0, 10)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="chart-label">
          {model.latest?.observedAt.slice(0, 10)}
        </text>
      </svg>

      <div className="chart-foot muted">
        Low {formatPrice(model.min, currency)} · High {formatPrice(model.max, currency)}
      </div>
    </div>
  );
}
