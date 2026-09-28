import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Theme = "light" | "dark";
export type ThemePreset = "ice" | "midnight" | "aurora" | "neon" | "high-contrast";
export type Density = "compact" | "comfortable" | "spacious";
export type ChatBackground = "plain" | "aurora" | "midnight" | "mesh";

export type ThemePreferences = {
  accent: string;
  bubbleMine: string;
  bubbleTheirs: string;
  chatBackground: ChatBackground;
  fontScale: number;
  density: Density;
  reduceMotion: boolean;
  highContrast: boolean;
  transparency: boolean;
};

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  accent: "#279fbe",
  bubbleMine: "#183b70",
  bubbleTheirs: "#ffffff",
  chatBackground: "plain",
  fontScale: 1,
  density: "comfortable",
  reduceMotion: false,
  highContrast: false,
  transparency: true,
};

export const THEME_PRESETS: Record<ThemePreset, Partial<ThemePreferences> & { mode: ThemeMode }> = {
  ice: { mode: "light", accent: "#279fbe", bubbleMine: "#183b70", bubbleTheirs: "#ffffff", chatBackground: "plain" },
  midnight: { mode: "dark", accent: "#69d6e8", bubbleMine: "#15566f", bubbleTheirs: "#1d293b", chatBackground: "midnight" },
  aurora: { mode: "dark", accent: "#8a7cff", bubbleMine: "#4650a5", bubbleTheirs: "#202344", chatBackground: "aurora" },
  neon: { mode: "dark", accent: "#23d7a4", bubbleMine: "#125b59", bubbleTheirs: "#172d38", chatBackground: "mesh" },
  "high-contrast": { mode: "light", accent: "#005fcc", bubbleMine: "#003b7a", bubbleTheirs: "#ffffff", chatBackground: "plain", highContrast: true, transparency: false },
};

export function parseThemePreferences(value: string | null): ThemePreferences {
  if (!value) return { ...DEFAULT_THEME_PREFERENCES };
  try {
    return { ...DEFAULT_THEME_PREFERENCES, ...JSON.parse(value) };
  } catch {
    return { ...DEFAULT_THEME_PREFERENCES };
  }
}

export function serializeThemePreferences(preferences: ThemePreferences): string {
  return JSON.stringify(preferences);
}

export function applyThemePreset(preferences: ThemePreferences, preset: ThemePreset) {
  const { mode, ...preferencePatch } = THEME_PRESETS[preset];
  return { mode, preferences: { ...preferences, ...preferencePatch } };
}

interface ThemeContextType {
  theme: Theme;
  mode: ThemeMode;
  preferences: ThemePreferences;
  presets: typeof THEME_PRESETS;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
  updatePreferences: (patch: Partial<ThemePreferences>) => void;
  applyPreset: (preset: ThemePreset) => void;
  resetPreferences: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = "icegram-theme-preferences-v1";
const MODE_KEY = "icegram-theme-mode-v1";

function readMode(fallback: ThemeMode): ThemeMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children, defaultTheme = "light", switchable = false }: { children: React.ReactNode; defaultTheme?: Theme; switchable?: boolean }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readMode(defaultTheme));
  const [preferences, setPreferences] = useState<ThemePreferences>(() => parseThemePreferences(localStorage.getItem(STORAGE_KEY)));
  const [systemDark, setSystemDark] = useState(false);
  const theme: Theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("icegram-reduce-motion", preferences.reduceMotion);
    root.classList.toggle("icegram-high-contrast", preferences.highContrast);
    root.classList.toggle("icegram-no-transparency", !preferences.transparency);
    root.dataset.icegramDensity = preferences.density;
    root.dataset.icegramWallpaper = preferences.chatBackground;
    root.style.setProperty("--icegram-accent", preferences.accent);
    root.style.setProperty("--primary", preferences.accent);
    root.style.setProperty("--ring", preferences.accent);
    root.style.setProperty("--sidebar-primary", preferences.accent);
    root.style.setProperty("--icegram-bubble-mine", preferences.bubbleMine);
    root.style.setProperty("--icegram-bubble-theirs", preferences.bubbleTheirs);
    root.style.setProperty("--icegram-font-scale", String(preferences.fontScale));
    root.style.fontSize = `${preferences.fontScale}em`;
    try {
      localStorage.setItem(STORAGE_KEY, serializeThemePreferences(preferences));
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [mode, preferences, theme]);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    mode,
    preferences,
    presets: THEME_PRESETS,
    toggleTheme: () => setModeState(previous => previous === "dark" ? "light" : "dark"),
    setMode: setModeState,
    updatePreferences: patch => setPreferences(previous => ({ ...previous, ...patch })),
    applyPreset: preset => {
      const selected = applyThemePreset(preferences, preset);
      setModeState(selected.mode);
      setPreferences(selected.preferences);
    },
    resetPreferences: () => { setModeState(defaultTheme); setPreferences(DEFAULT_THEME_PREFERENCES); },
    switchable,
  }), [defaultTheme, mode, preferences, switchable, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
