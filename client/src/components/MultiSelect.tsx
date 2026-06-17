import { useState } from "react";
import type { AirportInfo } from "../types";

interface Props {
  label: string;
  items: AirportInfo[];
  selected: string[];
  onChange: (codes: string[]) => void;
}

export default function MultiSelect({ label, items, selected, onChange }: Props) {
  const [filter, setFilter] = useState("");

  const visible = items.filter(
    (i) => i.city.toLowerCase().includes(filter.toLowerCase()) || i.code.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  return (
    <div className="multiselect">
      <label className="field-label">{label} ({selected.length} selected)</label>
      <input placeholder="Filter city or IATA code…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="chips">
        {selected.map((c) => (
          <span key={c} className="chip active" onClick={() => toggle(c)}>{c} ✕</span>
        ))}
      </div>
      <div className="options">
        {visible.map((i) => (
          <button key={i.code} className={selected.includes(i.code) ? "opt active" : "opt"} onClick={() => toggle(i.code)}>
            {i.city} ({i.code})
          </button>
        ))}
      </div>
    </div>
  );
}