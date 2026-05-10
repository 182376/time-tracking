import { ChevronRight, Palette } from "lucide-react";
import { useState } from "react";
import QuietDialog from "../../../shared/components/QuietDialog";
import QuietSegmentedFilter from "../../../shared/components/QuietSegmentedFilter";
import type { ColorScheme, ThemeMode } from "../../../shared/settings/appSettings.ts";

type ThemeLibrary = "light" | "dark";

type SettingsAppearancePanelProps = {
  themeMode: ThemeMode;
  onThemeModeChange: (nextThemeMode: ThemeMode) => void;
  colorSchemeLight: ColorScheme;
  onColorSchemeLightChange: (nextColorScheme: ColorScheme) => void;
  colorSchemeDark: ColorScheme;
  onColorSchemeDarkChange: (nextColorScheme: ColorScheme) => void;
  onConfirmColorSchemeChange: () => Promise<boolean>;
  colorSchemeConfirming: boolean;
};

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

const THEME_LIBRARY_OPTIONS: Array<{
  value: ThemeLibrary;
  label: string;
}> = [
  { value: "light", label: "浅色主题" },
  { value: "dark", label: "深色主题" },
];

const COLOR_SCHEME_OPTIONS: Record<ThemeLibrary, Array<{
  value: ColorScheme;
  label: string;
  swatches: [string, string, string, string, string, string];
}>> = {
  light: [
    { value: "default", label: "默认", swatches: ["#fbfbfb", "#ffffff", "#f5f5f5", "#315f9f", "#3f74c2", "#2f7d49"] },
    { value: "ayu", label: "Ayu", swatches: ["#fafafa", "#f3f4f5", "#d9dce0", "#36a3d9", "#86b300", "#f29718"] },
    { value: "catppuccin", label: "Catppuccin", swatches: ["#eff1f5", "#e6e9ef", "#ccd0da", "#1e66f5", "#40a02b", "#ea76cb"] },
    { value: "dracula", label: "Dracula", swatches: ["#f8f8f2", "#eeeeea", "#d8d8d2", "#6272a4", "#bd93f9", "#ff79c6"] },
    { value: "everforest", label: "Everforest", swatches: ["#fdf6e3", "#f4f0d9", "#d8d3ba", "#3a94c5", "#8da101", "#dfa000"] },
    { value: "flexoki", label: "Flexoki", swatches: ["#fffcf0", "#f2f0e5", "#e6e4d9", "#205ea6", "#24837b", "#ad8301"] },
    { value: "github", label: "GitHub", swatches: ["#ffffff", "#f6f8fa", "#d0d7de", "#0969da", "#2da44e", "#cf222e"] },
    { value: "gruvbox", label: "Gruvbox", swatches: ["#fbf1c7", "#f2e5bc", "#d5c4a1", "#d65d0e", "#458588", "#9d0006"] },
    { value: "kanagawa", label: "Kanagawa", swatches: ["#f2ecdc", "#fbf7ef", "#d8cfbc", "#4d699b", "#6f894e", "#c4746e"] },
    { value: "material", label: "Material", swatches: ["#fafafa", "#ffffff", "#e0e0e0", "#1976d2", "#2e7d32", "#c2185b"] },
    { value: "nord", label: "Nord", swatches: ["#f7f9fc", "#eceff4", "#d8dee9", "#5e81ac", "#81a1c1", "#bf616a"] },
    { value: "one", label: "One", swatches: ["#fafafa", "#f4f5f7", "#d7dae0", "#4078f2", "#50a14f", "#a626a4"] },
    { value: "rose-pine", label: "Rose Pine", swatches: ["#faf4ed", "#fffaf3", "#f2e9e1", "#907aa9", "#286983", "#b4637a"] },
    { value: "solarized", label: "Solarized", swatches: ["#fdf6e3", "#eee8d5", "#93a1a1", "#268bd2", "#859900", "#d33682"] },
    { value: "tokyo-night", label: "Tokyo Night", swatches: ["#e1e2e7", "#d5d6db", "#c4c8da", "#2e7de9", "#587539", "#9854f1"] },
    { value: "vitesse", label: "Vitesse", swatches: ["#ffffff", "#f8f8f8", "#e2e2e3", "#3451b2", "#18794e", "#8e4ec6"] },
  ],
  dark: [
    { value: "default", label: "默认", swatches: ["#212121", "#2d2d2d", "#404040", "#8ba1c0", "#93a9c8", "#82ad8b"] },
    { value: "ayu", label: "Ayu", swatches: ["#0f1419", "#151a21", "#2d3640", "#59c2ff", "#bae67e", "#ffb454"] },
    { value: "catppuccin", label: "Catppuccin", swatches: ["#1e1e2e", "#181825", "#313244", "#89b4fa", "#a6e3a1", "#f5c2e7"] },
    { value: "dracula", label: "Dracula", swatches: ["#282a36", "#21222c", "#44475a", "#8be9fd", "#50fa7b", "#ff79c6"] },
    { value: "everforest", label: "Everforest", swatches: ["#2b3339", "#323c41", "#4f5b58", "#7fbbb3", "#a7c080", "#e67e80"] },
    { value: "flexoki", label: "Flexoki", swatches: ["#100f0f", "#1c1b1a", "#403e3c", "#4385be", "#3aa99f", "#d0a215"] },
    { value: "github", label: "GitHub", swatches: ["#0d1117", "#161b22", "#30363d", "#2f81f7", "#3fb950", "#f85149"] },
    { value: "gruvbox", label: "Gruvbox", swatches: ["#282828", "#3c3836", "#665c54", "#fe8019", "#83a598", "#fb4934"] },
    { value: "kanagawa", label: "Kanagawa", swatches: ["#1f1f28", "#2a2a37", "#54546d", "#7e9cd8", "#98bb6c", "#e46876"] },
    { value: "material", label: "Material", swatches: ["#121212", "#1e1e1e", "#343434", "#90caf9", "#a5d6a7", "#f48fb1"] },
    { value: "nord", label: "Nord", swatches: ["#2e3440", "#3b4252", "#4c566a", "#88c0d0", "#81a1c1", "#bf616a"] },
    { value: "one", label: "One", swatches: ["#282c34", "#21252b", "#3e4451", "#61afef", "#98c379", "#c678dd"] },
    { value: "rose-pine", label: "Rose Pine", swatches: ["#191724", "#26233a", "#403d52", "#c4a7e7", "#31748f", "#eb6f92"] },
    { value: "solarized", label: "Solarized", swatches: ["#002b36", "#073642", "#586e75", "#268bd2", "#2aa198", "#d33682"] },
    { value: "tokyo-night", label: "Tokyo Night", swatches: ["#1a1b26", "#24283b", "#414868", "#7aa2f7", "#9ece6a", "#bb9af7"] },
    { value: "vitesse", label: "Vitesse", swatches: ["#121212", "#1b1b1b", "#393939", "#a8b1ff", "#4fd1c5", "#f6ad55"] },
  ],
};

export default function SettingsAppearancePanel({
  themeMode,
  onThemeModeChange,
  colorSchemeLight,
  onColorSchemeLightChange,
  colorSchemeDark,
  onColorSchemeDarkChange,
  onConfirmColorSchemeChange,
  colorSchemeConfirming,
}: SettingsAppearancePanelProps) {
  const [activeLibrary, setActiveLibrary] = useState<ThemeLibrary | null>(null);
  const activeLibraryOption = THEME_LIBRARY_OPTIONS.find((option) => option.value === activeLibrary);
  const activeColorScheme = activeLibrary === "dark" ? colorSchemeDark : colorSchemeLight;
  const changeActiveColorScheme = activeLibrary === "dark" ? onColorSchemeDarkChange : onColorSchemeLightChange;
  const handleConfirmColorScheme = async () => {
    const accepted = await onConfirmColorSchemeChange();
    if (accepted) {
      setActiveLibrary(null);
    }
  };

  return (
    <section className="qp-panel p-5 md:p-6">
      <div className="flex items-center gap-2.5 border-b border-[var(--qp-border-subtle)] pb-2">
        <Palette size={16} className="text-[var(--qp-accent-default)]" />
        <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">外观</h2>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_236px] md:gap-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--qp-text-tertiary)]">
            主题模式
          </label>
          <p className="mt-2 text-sm leading-relaxed text-[var(--qp-text-secondary)]">
            选择浅色、深色，或跟随系统外观自动切换。
          </p>
        </div>

        <QuietSegmentedFilter
          value={themeMode}
          options={THEME_MODE_OPTIONS}
          onChange={onThemeModeChange}
          className="md:self-end md:justify-self-end"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_236px] md:gap-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--qp-text-tertiary)]">
            配色方案
          </label>
          <p className="mt-2 text-sm leading-relaxed text-[var(--qp-text-secondary)]">
            分别设置浅色和深色主题的整体配色风格。
          </p>
        </div>

        <div className="settings-theme-entry-list md:self-end md:justify-self-end" role="group" aria-label="配色方案">
          {THEME_LIBRARY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setActiveLibrary(option.value)}
              className="settings-theme-entry"
            >
              <span className="settings-theme-entry-title">{option.label}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <QuietDialog
        open={activeLibrary !== null}
        title={activeLibraryOption?.label ?? "主题"}
        description="选择后会即时预览对应主题的整体配色，保存后生效。"
        onClose={() => setActiveLibrary(null)}
        surfaceClassName="qp-theme-dialog-surface"
        actions={(
          <>
            <button
              type="button"
              onClick={() => setActiveLibrary(null)}
              className="qp-button-secondary qp-dialog-action"
              disabled={colorSchemeConfirming}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmColorScheme()}
              className="qp-button-primary qp-dialog-action"
              disabled={colorSchemeConfirming}
            >
              {colorSchemeConfirming ? "保存中" : "确认"}
            </button>
          </>
        )}
      >
        {activeLibrary ? (
          <div className="qp-theme-dialog-body">
            <div className="settings-color-scheme-list" role="group" aria-label={activeLibraryOption?.label}>
              {COLOR_SCHEME_OPTIONS[activeLibrary].map((option) => {
                const selected = option.value === activeColorScheme;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => changeActiveColorScheme(option.value)}
                    className={`settings-color-scheme-option ${
                      selected ? "settings-color-scheme-option-selected" : ""
                    }`.trim()}
                  >
                    <span className="settings-color-scheme-swatches" aria-hidden="true">
                      {option.swatches.map((swatch) => (
                        <span
                          key={swatch}
                          className="settings-color-scheme-swatch"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </QuietDialog>
    </section>
  );
}
