import { useState } from "react";
import type { CustomPreset, PresetCategory, RoutePreset } from "@flighthunter/shared";
import { PRESET_CATEGORY_LABELS } from "@flighthunter/shared";

interface Props {
  builtIn: RoutePreset[];
  custom: CustomPreset[];
  onApply: (origins: string[], destinations: string[]) => void;
  onSaveCurrent: () => void;
  onDeleteCustom: (id: string) => void;
  canSave: boolean;
}

const ORDER: PresetCategory[] = ["asia", "americas", "europe", "beach", "domestic"];

/**
 * Route corridors, grouped so 20+ presets stay browsable, with the user's own
 * saved corridors listed first.
 */
export default function PresetPicker({
  builtIn,
  custom,
  onApply,
  onSaveCurrent,
  onDeleteCustom,
  canSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<PresetCategory | "mine">(
    custom.length > 0 ? "mine" : "asia",
  );

  const groups = ORDER.map((c) => ({
    id: c,
    label: PRESET_CATEGORY_LABELS[c],
    presets: builtIn.filter((p) => p.category === c),
  })).filter((g) => g.presets.length > 0);

  const visible = category === "mine" ? [] : (groups.find((g) => g.id === category)?.presets ?? []);

  return (
    <div className="presets-block">
      <button type="button" className="disclosure" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} Route presets
        <span className="muted"> ({builtIn.length + custom.length})</span>
      </button>

      {open && (
        <div className="presets-body">
          <div className="preset-tabs">
            <button
              type="button"
              className={category === "mine" ? "preset-tab active" : "preset-tab"}
              onClick={() => setCategory("mine")}
            >
              Mine ({custom.length})
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={category === g.id ? "preset-tab active" : "preset-tab"}
                onClick={() => setCategory(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>

          {category === "mine" ? (
            <>
              {custom.length === 0 ? (
                <p className="muted">
                  No saved corridors yet. Pick your airports, then save them here for one-click reuse.
                </p>
              ) : (
                <div className="presets">
                  {custom.map((p) => (
                    <span key={p.id} className="preset custom">
                      <button type="button" onClick={() => onApply(p.origins, p.destinations)}>
                        {p.name}
                        <span className="muted">
                          {" "}
                          {p.origins.length}→{p.destinations.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="preset-del"
                        title="Delete preset"
                        onClick={() => onDeleteCustom(p.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn-ghost small"
                onClick={onSaveCurrent}
                disabled={!canSave}
              >
                Save current airports as a preset
              </button>
            </>
          ) : (
            <div className="presets">
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="preset"
                  title={p.description}
                  onClick={() => onApply(p.origins, p.destinations)}
                >
                  {p.label}
                  <span className="muted">
                    {" "}
                    {p.origins.length}→{p.destinations.length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
