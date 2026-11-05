import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** Mesma chave lida pelo script inline do index.html (evita piscar antes do React). */
export const THEME_STORAGE_KEY = "mock-api:theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemTheme = (): ResolvedTheme => (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");

interface ThemeState {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref(p: ThemePref): void;
}

const ThemeContext = createContext<ThemeState>({ pref: "system", resolved: "dark", setPref: () => undefined });

/** Escuro por padrão; "system" segue o SO. O tema resolvido sempre vai para data-theme no <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = pref === "system" ? system : pref;
  // Escrita idempotente durante o render: os filhos que leem tokens (useThemeColors) já veem o tema novo.
  if (document.documentElement.getAttribute("data-theme") !== resolved) document.documentElement.setAttribute("data-theme", resolved);

  const setPref = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    setPrefState(p);
  }, []);

  return <ThemeContext.Provider value={{ pref, resolved, setPref }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Lê tokens de cor do tema atual (para libs que não aceitam var() em atributos SVG). */
export function useThemeColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--chart-${i}`)),
      grid: v("--chart-grid"),
      text3: v("--text-3"),
      text: v("--text"),
      surface: v("--surface"),
      border: v("--border"),
      borderStrong: v("--border-strong"),
      shadow: v("--shadow-pop"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula quando o tema muda
  }, [resolved]);
}
