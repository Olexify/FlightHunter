import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Airport } from "@flighthunter/shared";
import { api } from "../api";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  label: string;
  selected: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  max?: number;
}

/**
 * Multi-select autocomplete over the full worldwide airport list.
 *
 * Replaces the old fixed checkbox grid of 15 hardcoded airports. Lookups are
 * debounced and each one aborts the previous, so fast typing cannot leave a
 * stale response rendered.
 */
export default function AirportPicker({
  label,
  selected,
  onChange,
  placeholder = "City, airport or IATA code…",
  max = 30,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const debounced = useDebounce(query, 200);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  /* Resolve chips to city names so selections read as places, not codes. */
  useEffect(() => {
    const missing = selected.filter((c) => !labels[c]);
    if (missing.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missing.map((code) =>
        api
          .airport(code)
          .then((a) => [code, `${a.city} (${a.iata})`] as const)
          .catch(() => [code, code] as const),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setLabels((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });

    return () => {
      cancelled = true;
    };
  }, [selected, labels]);

  /* Debounced, abortable suggestion lookup. */
  useEffect(() => {
    if (debounced.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    api
      .airports(debounced, 8, controller.signal)
      .then((list) => {
        setResults(list);
        setActive(0);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setLoading(false);
      });

    return () => controller.abort();
  }, [debounced]);

  /* Close the dropdown when focus leaves the component entirely. */
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const available = useMemo(
    () => results.filter((a) => !selected.includes(a.iata)),
    [results, selected],
  );

  const add = (airport: Airport): void => {
    if (selected.includes(airport.iata) || selected.length >= max) return;
    setLabels((prev) => ({ ...prev, [airport.iata]: `${airport.city} (${airport.iata})` }));
    onChange([...selected, airport.iata]);
    setQuery("");
    setResults([]);
  };

  const remove = (code: string): void => onChange(selected.filter((c) => c !== code));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, available.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = available[active];
      if (choice) add(choice);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      // Backspace on an empty box removes the last chip, as in a tag field.
      remove(selected[selected.length - 1] as string);
    }
  };

  return (
    <div className="field" ref={boxRef}>
      <label className="field-label">
        {label} <span className="muted">({selected.length})</span>
      </label>

      {selected.length > 0 && (
        <div className="chips">
          {selected.map((code) => (
            <button
              key={code}
              type="button"
              className="chip"
              onClick={() => remove(code)}
              title="Remove"
            >
              {labels[code] ?? code}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove {labels[code] ?? code}</span>
            </button>
          ))}
        </div>
      )}

      <div className="combo">
        <input
          type="text"
          value={query}
          placeholder={selected.length >= max ? `Maximum ${max} selected` : placeholder}
          disabled={selected.length >= max}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open && available.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading && <span className="combo-spinner" aria-hidden="true" />}

        {open && available.length > 0 && (
          <ul className="combo-list" id={listId} role="listbox">
            {available.map((a, i) => (
              <li key={a.iata}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "combo-item active" : "combo-item"}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(a)}
                >
                  <span className="combo-code">{a.iata}</span>
                  <span className="combo-main">
                    <strong>{a.city}</strong>
                    <span className="muted">{a.name}</span>
                  </span>
                  <span className="combo-country muted">{a.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
