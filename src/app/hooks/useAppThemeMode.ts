import { useEffect } from "react";
import type { ColorScheme, ThemeMode } from "../../shared/settings/appSettings.ts";

type EffectiveTheme = "light" | "dark";

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function resolveEffectiveTheme(themeMode: ThemeMode, prefersDark: boolean): EffectiveTheme {
  if (themeMode === "dark") return "dark";
  if (themeMode === "system" && prefersDark) return "dark";
  return "light";
}

function applyDocumentTheme(themeMode: ThemeMode, effectiveTheme: EffectiveTheme, colorScheme: ColorScheme) {
  const root = document.documentElement;
  root.dataset.themeMode = themeMode;
  root.dataset.theme = effectiveTheme;
  root.dataset.colorScheme = colorScheme;
  root.style.colorScheme = effectiveTheme;
}

export function useAppThemeMode(
  themeMode: ThemeMode,
  colorSchemeLight: ColorScheme,
  colorSchemeDark: ColorScheme,
) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      applyDocumentTheme(themeMode, "light", colorSchemeLight);
      return undefined;
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
    const syncTheme = () => {
      const effectiveTheme = resolveEffectiveTheme(themeMode, mediaQuery.matches);
      applyDocumentTheme(
        themeMode,
        effectiveTheme,
        effectiveTheme === "dark" ? colorSchemeDark : colorSchemeLight,
      );
    };

    syncTheme();

    if (themeMode !== "system") {
      return undefined;
    }

    mediaQuery.addEventListener("change", syncTheme);
    return () => {
      mediaQuery.removeEventListener("change", syncTheme);
    };
  }, [colorSchemeDark, colorSchemeLight, themeMode]);
}
