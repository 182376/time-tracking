# AGENTS.md

This repository uses `Quiet Pro` as the only long-term UI design baseline.

These instructions apply to all UI work unless the user gives an explicit task-specific override.

## Always Read First

- UI work must follow `docs/quiet-pro-component-guidelines.md`.
- Architecture refactors and new modules should align with `docs/architecture-target.md`.

## Quiet Pro Baseline

- Build calm, professional, restrained desktop-product UI.
- Prefer typography, spacing, alignment, and hierarchy over decoration.
- Keep the interface neutral and durable rather than flashy or brand-heavy.
- New UI should feel native to the existing Dashboard, History, App Mapping, and Settings surfaces.

## Hard Rules

- Do not introduce glassmorphism, blur-heavy panels, neon glow, or large gradient backgrounds.
- Do not hardcode new colors, radii, shadows, or border styles when a token or semantic variable should exist.
- Do not add one-off visual treatments that only work on a single page.
- Do not make components louder than the information they present.
- Do not trade readability or efficiency for "design feeling".

## Token And Styling Rules

- Reuse existing semantic tokens first.
- If a new visual role is needed, add or extend a token instead of hardcoding a value in a component.
- Keep radius, border, elevation, and motion within the existing Quiet Pro scale.
- Category or status colors may vary by feature, but surrounding chrome must stay within the Quiet Pro system.

## Component Rules

- New components must define clear `default`, `hover`, `active`, `focus`, `disabled`, and where relevant `loading` and `empty` states.
- Prefer existing component archetypes: `panel`, `control`, `chip`, `status`.
- Icons support recognition; they should not become the main visual focus.
- Dense pages may be efficient, but they must still scan cleanly at a glance.

## Implementation Preference

- Extend the design system before inventing a page-local workaround.
- Preserve existing product behavior unless the user explicitly asks for interaction changes.
- If a proposed UI change conflicts with Quiet Pro or requires a new visual direction, pause and confirm before proceeding.

## Architecture Direction

- Prefer gradual migration toward the target architecture instead of big-bang rewrites.
- Frontend should move toward feature-first structure with shared code explicitly separated.
- Rust backend should move toward clear layers: app, commands, platform, engine, data, domain.
- Keep Tauri command handlers thin; move business logic out of entry and command wiring files.
- Avoid introducing new cross-feature utilities in ad hoc locations when they belong in a feature module or shared layer.
- Treat files under `docs/archive/` as historical context, not the default source of truth.

## Documentation Hygiene

- Top-level `docs/` is for active long-lived reference documents only.
- One-off execution plans, temporary fix plans, and completed task documents should not stay in top-level `docs/`.
- When a one-off document is no longer the current source of truth, move it to `docs/archive/`.
- Do not update or rely on `docs/archive/*` as the default execution basis unless the user explicitly asks for historical context.

## Encoding Rules

- Markdown and documentation files must be saved as UTF-8.
- When editing Chinese documentation on Windows, preserve readable UTF-8 text and do not introduce mojibake.
- Do not rewrite `.md` files through shell output or redirection patterns that may change encoding implicitly.
- If a documentation file appears garbled in terminal output, verify the file bytes before assuming the content is corrupted.
