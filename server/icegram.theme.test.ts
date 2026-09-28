import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCES,
  THEME_PRESETS,
  applyThemePreset,
  parseThemePreferences,
  serializeThemePreferences,
} from "../client/src/contexts/ThemeContext";

describe("ICEGRAM Theme Studio preferences", () => {
  it("returns accessible defaults when stored preferences are missing or invalid", () => {
    expect(parseThemePreferences(null)).toEqual(DEFAULT_THEME_PREFERENCES);
    expect(parseThemePreferences("not-json")).toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it("round-trips preferences for session persistence", () => {
    const preferences = { ...DEFAULT_THEME_PREFERENCES, fontScale: 1.15, reduceMotion: true, density: "spacious" as const };
    expect(parseThemePreferences(serializeThemePreferences(preferences))).toEqual(preferences);
  });

  it("applies a preset without losing unrelated user preferences", () => {
    const current = { ...DEFAULT_THEME_PREFERENCES, fontScale: 1.2, reduceMotion: true };
    const result = applyThemePreset(current, "high-contrast");
    expect(result.mode).toBe("light");
    expect(result.preferences.highContrast).toBe(true);
    expect(result.preferences.transparency).toBe(false);
    expect(result.preferences.fontScale).toBe(1.2);
    expect(result.preferences.reduceMotion).toBe(true);
  });

  it("keeps every built-in preset tied to a valid mode and accent", () => {
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(["light", "dark", "system"]).toContain(preset.mode);
      expect(preset.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
