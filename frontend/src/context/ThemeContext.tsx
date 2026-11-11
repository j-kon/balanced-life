import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "bld_theme";

function readStoredPreference(): ThemePreference {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark") return val;
  } catch {
    // Ignore storage access errors
  }
  return "system";
}

function detectSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function syncDomTheme(
  preference: ThemePreference,
  resolved: ResolvedTheme,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.themePref = preference;
  root.dataset.theme = resolved;

  const schemeContent = preference === "system" ? "light dark" : preference;
  let schemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (!schemeMeta) {
    schemeMeta = document.createElement("meta");
    schemeMeta.setAttribute("name", "color-scheme");
    document.head.appendChild(schemeMeta);
  }
  schemeMeta.setAttribute("content", schemeContent);

  let themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeColorMeta) {
    themeColorMeta = document.createElement("meta");
    themeColorMeta.setAttribute("name", "theme-color");
    document.head.appendChild(themeColorMeta);
  }
  themeColorMeta.setAttribute(
    "content",
    resolved === "dark" ? "#1a1114" : "#570008",
  );
}

export type ThemeContextValue = {
  preference: ThemePreference;
  systemTheme: ResolvedTheme;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  systemTheme: "light",
  resolvedTheme: "light",
  setPreference: () => {},
  cyclePreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredPreference,
  );
  const [systemTheme, setSystemTheme] =
    useState<ResolvedTheme>(detectSystemTheme);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  useEffect(() => {
    syncDomTheme(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPreferenceState(
          e.newValue === "light" || e.newValue === "dark"
            ? e.newValue
            : "system",
        );
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Theme still applies in DOM even if localStorage is blocked
    }
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference(
      preference === "system"
        ? "light"
        : preference === "light"
          ? "dark"
          : "system",
    );
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      systemTheme,
      resolvedTheme,
      setPreference,
      cyclePreference,
    }),
    [preference, systemTheme, resolvedTheme, setPreference, cyclePreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

