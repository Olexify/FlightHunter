import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "fh.theme";

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Private mode / blocked storage — fall through to the system default.
  }
  return "system";
}

/** Theme preference, persisted per browser and applied to <html data-theme>. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not fatal — the choice simply will not survive a reload.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);

  const cycle = useCallback(() => {
    setThemeState((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  }, []);

  return { theme, setTheme, cycle };
}
