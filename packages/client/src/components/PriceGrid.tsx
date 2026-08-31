import type { PriceGridCell } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";

interface Props {
  cells: PriceGridCell[];
  selectedDate: string;
  onPick: (date: string) => void;
}

/**
 * Flexible-date strip. Each column is the cheapest fare found on that day, so
 * shifting a trip by a day or two is a single glance rather than six searches.
 */
export default function PriceGrid({ cells, selectedDate, onPick }: Props) {
  if (cells.length <= 1) return null;

  const prices = cells
    .map((c) => c.cheapestPrice)
    .filter((p): p is number => p !== null && Number.isFinite(p));

  if (prices.length === 0) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(1, max - min);

  return (
    <section className="price-grid">
      <div className="price-grid-head">
        <h3>Nearby dates</h3>
        <span className="muted">Cheapest fare per departure day — click to search that date</span>
      </div>

      <div className="grid-strip" role="list">
        {cells.map((cell) => {
          const price = cell.cheapestPrice;
          const isSelected = cell.departureDate === selectedDate;
          const isBest = price !== null && price === min;

          // Bars stay readable even when the spread is tiny.
          const height = price === null ? 8 : 24 + ((max - price) / span) * 46;

          const [, month, day] = cell.departureDate.split("-") as [string, string, string];

          const classes = ["grid-cell"];
          if (isSelected) classes.push("selected");
          if (isBest) classes.push("best");

          return (
            <button
              key={cell.departureDate}
              type="button"
              role="listitem"
              className={classes.join(" ")}
              onClick={() => onPick(cell.departureDate)}
              disabled={price === null}
              title={
                price === null
                  ? "No fares found for this date"
                  : `${cell.departureDate}: ${formatPrice(price, cell.currency)}`
              }
            >
              <span className="grid-price">
                {price === null ? "—" : formatPrice(price, cell.currency)}
              </span>
              <span className="grid-bar" style={{ height: `${height}px` }} />
              <span className="grid-date">
                {day}/{month}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
