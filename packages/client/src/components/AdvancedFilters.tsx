import type { Alliance, FareBrand } from "@flighthunter/shared";
import { ALLIANCE_LABELS, FARE_BRAND_LABELS } from "@flighthunter/shared";
import type { FormState } from "../searchParams";

interface Props {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}

const ALLIANCES: Alliance[] = ["STAR_ALLIANCE", "SKYTEAM", "ONEWORLD", "NONE"];
const BRANDS: FareBrand[] = ["BASIC", "STANDARD", "FLEX"];

/** Comma-separated IATA input, normalised to upper-case codes. */
function CodeList({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function AdvancedFilters({ form, onChange }: Props) {
  return (
    <div className="advanced">
      {/* ----------------------------- Airlines ----------------------------- */}
      <fieldset>
        <legend>Airlines</legend>

        <div className="chip-row">
          {ALLIANCES.map((a) => (
            <button
              key={a}
              type="button"
              className={form.alliances.includes(a) ? "toggle-chip active" : "toggle-chip"}
              onClick={() => onChange({ alliances: toggleIn(form.alliances, a) })}
            >
              {ALLIANCE_LABELS[a]}
            </button>
          ))}
        </div>

        <div className="grid2">
          <CodeList
            id="include"
            label="Only these airlines"
            placeholder="TK, LO"
            value={form.includeAirlines}
            onChange={(includeAirlines) => onChange({ includeAirlines })}
          />
          <CodeList
            id="exclude"
            label="Never these airlines"
            placeholder="SU, PS"
            value={form.excludeAirlines}
            onChange={(excludeAirlines) => onChange({ excludeAirlines })}
          />
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={form.excludeLowCost}
            onChange={(e) => onChange({ excludeLowCost: e.target.checked })}
          />
          <span>Hide low-cost carriers</span>
        </label>
      </fieldset>

      {/* ------------------------------- Fare ------------------------------- */}
      <fieldset>
        <legend>Fare &amp; baggage</legend>

        <div className="chip-row">
          {BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              className={form.fareBrands.includes(b) ? "toggle-chip active" : "toggle-chip"}
              onClick={() => onChange({ fareBrands: toggleIn(form.fareBrands, b) })}
            >
              {FARE_BRAND_LABELS[b]}
            </button>
          ))}
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={form.requireCheckedBag}
            onChange={(e) => onChange({ requireCheckedBag: e.target.checked })}
          />
          <span>Checked bag included</span>
        </label>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="maxPrice">Max price</label>
            <input
              id="maxPrice"
              type="number"
              min={0}
              placeholder="any"
              value={form.maxPrice ?? ""}
              onChange={(e) =>
                onChange({ maxPrice: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="perRouteInput">Offers per route</label>
            <input
              id="perRouteInput"
              type="number"
              min={3}
              max={120}
              value={form.maxPerPair}
              onChange={(e) =>
                onChange({ maxPerPair: Math.min(120, Math.max(3, Number(e.target.value) || 24)) })
              }
            />
          </div>
        </div>
      </fieldset>

      {/* ----------------------------- Routing ------------------------------ */}
      <fieldset>
        <legend>Routing</legend>

        <div className="grid2">
          <CodeList
            id="via"
            label="Connect via"
            placeholder="IST, DXB"
            value={form.viaAirports}
            onChange={(viaAirports) => onChange({ viaAirports })}
          />
          <CodeList
            id="avoid"
            label="Never connect via"
            placeholder="LHR, CDG"
            value={form.avoidAirports}
            onChange={(avoidAirports) => onChange({ avoidAirports })}
          />
        </div>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="maxSeg">Max flights per leg</label>
            <select
              id="maxSeg"
              value={form.maxSegments === null ? "any" : String(form.maxSegments)}
              onChange={(e) =>
                onChange({ maxSegments: e.target.value === "any" ? null : Number(e.target.value) })
              }
            >
              <option value="any">Any</option>
              <option value="1">1 flight</option>
              <option value="2">Up to 2</option>
              <option value="3">Up to 3</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="nearby">Include nearby airports</label>
            <select
              id="nearby"
              value={form.nearbyRadiusKm}
              onChange={(e) => onChange({ nearbyRadiusKm: Number(e.target.value) })}
            >
              <option value={0}>Exact airports only</option>
              <option value={100}>Within 100 km</option>
              <option value={200}>Within 200 km</option>
              <option value={350}>Within 350 km</option>
            </select>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="minLay">Min layover (min)</label>
            <input
              id="minLay"
              type="number"
              min={0}
              placeholder="any"
              value={form.minLayoverMinutes ?? ""}
              onChange={(e) =>
                onChange({ minLayoverMinutes: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="maxLay">Max layover (min)</label>
            <input
              id="maxLay"
              type="number"
              min={30}
              placeholder="any"
              value={form.maxLayoverMinutes ?? ""}
              onChange={(e) =>
                onChange({ maxLayoverMinutes: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>
      </fieldset>

      {/* ------------------------------ Timing ------------------------------ */}
      <fieldset>
        <legend>Timing</legend>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="departAfter">Depart after</label>
            <input
              id="departAfter"
              type="time"
              value={form.departAfter}
              onChange={(e) => onChange({ departAfter: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="departBefore">Depart before</label>
            <input
              id="departBefore"
              type="time"
              value={form.departBefore}
              onChange={(e) => onChange({ departBefore: e.target.value })}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="arriveAfter">Arrive after</label>
            <input
              id="arriveAfter"
              type="time"
              value={form.arriveAfter}
              onChange={(e) => onChange({ arriveAfter: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="arriveBefore">Arrive before</label>
            <input
              id="arriveBefore"
              type="time"
              value={form.arriveBefore}
              onChange={(e) => onChange({ arriveBefore: e.target.value })}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label className="field-label" htmlFor="maxHours">Max total hours</label>
            <input
              id="maxHours"
              type="number"
              min={1}
              max={72}
              placeholder="any"
              value={form.maxDurationHours ?? ""}
              onChange={(e) =>
                onChange({ maxDurationHours: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <label className="toggle align-end">
            <input
              type="checkbox"
              checked={form.avoidRedEye}
              onChange={(e) => onChange({ avoidRedEye: e.target.checked })}
            />
            <span>No 01:00–05:00 departures</span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
