# Theme Mode Execution Plan

Date: 2026-05-09

## Goal

Add a Quiet Pro compatible appearance setting with three modes:

- Light
- Dark
- Follow system

The selected mode must persist, apply across the app shell and all core pages, and keep the desktop-product tone restrained.

## Scope

- Settings page adds a clear appearance control.
- App startup applies the persisted appearance before normal use.
- Follow system reacts to OS/browser color-scheme changes while selected.
- Existing light UI remains the default for existing users.
- Dark mode is token-driven, not page-local color overrides.

## Architecture Decision

- Setting owner: `shared/settings` for the stable `AppSettings` contract.
- Persistence owner: `platform/persistence/appSettingsStore.ts` for SQLite setting mapping and normalization.
- Runtime theme owner: `app/*` for app-wide application of the chosen theme.
- UI owner: `features/settings/*` for the Settings page control.
- Styling owner: `src/App.css` semantic Quiet Pro tokens.

## Checklist

- [x] Add `ThemeMode = "light" | "dark" | "system"` and `themeMode` to `AppSettings`.
- [x] Add default `themeMode: "system"` or `"light"` after checking current product behavior; preserve existing light appearance unless explicitly changed.
- [x] Persist `theme_mode` through `appSettingsStore`, including normalization fallback for unknown values.
- [x] Add a small app-level theme service/hook that resolves the effective theme and writes `data-theme` / `color-scheme` to the document root.
- [x] Make system-follow mode respond to `prefers-color-scheme` changes without requiring restart.
- [x] Add Settings page UI using existing Quiet Pro controls, preferably a compact segmented control labeled Light / Dark / Follow system.
- [x] Add dark theme semantic token values in `App.css`; do not hardcode page-specific dark colors.
- [x] Review high-traffic surfaces for token gaps: title bar, sidebar, panels, controls, charts, tables, settings, data page, widget primitives.
- [x] Update tests for settings normalization, patch generation, and base `AppSettings` fixtures.
- [x] Add focused tests for theme-mode normalization and patch behavior.
- [x] Run `npm run test:settings`.
- [x] Run `npm run test:interaction`.
- [x] Run `npm run build`.
- [x] Run broader validation if implementation touches app shell or shared settings in a way that warrants it: `npm run check:frontend`.
- [x] Attempt running-UI sanity check for light, dark, and system modes; use UI smoke and frontend validation as the fallback when the dev server is unavailable.
- [x] Move this file to `docs/archive/theme-mode-execution-plan.md` after all implementation and validation are complete.

## Notes

- Current working tree already has an unrelated Data page header-order tweak in `src/features/data/components/Data.tsx`; do not revert it.
- Keep all UI within Quiet Pro: calm, neutral, tokenized, no glow, no large gradients.
- Avoid introducing a new theme library unless the existing app structure cannot support the feature.
- Running-UI sanity-check was attempted but the dev server was not available in this session: sandboxed Vite/preview failed with `spawn EPERM`, and the earlier escalated dev run reported the configured port as already in use. Fallback validation completed with `npm run test:ui-smoke` and `npm run check:frontend`.
