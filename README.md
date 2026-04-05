# Time Tracker

A native desktop time tracker built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

It watches the active window on Windows, records app sessions locally, and turns them into a clean daily dashboard plus a readable history timeline.

## Features

- **Native window tracking**: Uses Rust and the Windows API to detect the current foreground app with low overhead.
- **AFK-aware timing**: One shared AFK threshold controls both idle cutoff and timeline continuity. If you go idle for longer than the threshold, the current session is cut back to the threshold boundary instead of counting the whole idle period.
- **Crash-safe sealing and watchdog recovery**: The tracker stores a lightweight local heartbeat, records the last successful sample, and uses a watchdog to seal stale active sessions near the last live poll instead of letting them keep running forever.
- **Lock and sleep boundaries**: Windows lock/unlock and suspend/resume events are handled natively so sessions end at system boundaries instead of leaking through lunch breaks or sleep.
- **Real-duration stats**: App rankings, distributions, hourly activity, and rolling summaries stay on real active duration instead of timeline display spans.
- **Focus timeline merging**: Brief interruptions inside the AFK threshold are merged only for readability, so the timeline is easier to scan without inflating tracked duration.
- **System app filtering**: System-level apps such as Explorer, Terminal, and Task Manager are excluded from tracked results.
- **Governed app mapping engine**: Executable identity is normalized through canonical rules and then resolved by default mappings, keyword heuristics, and user override layers.
- **Expanded app categories**: Supports a finer category model (`development`, `office`, `browser`, `communication`, `meeting`, `video`, `music`, `game`, `design`, `reading`, `finance`, `utility`, `system`, `other`).
- **Icon-driven app theme colors**: App bars in ranking, timeline, and app distribution prefer dominant icon color; focus distribution remains category-color based.
- **Dedicated app mapping page**: A standalone `App Classification & Color` page supports reviewing all observed apps in one place with responsive single/double-column layouts.
- **Global override controls**: Users can rename, reclassify, recolor, exclude-from-stats, and set title-capture behavior per app; overrides apply globally across Dashboard, History, and Focus Timeline.
- **Per-app lifecycle controls**: Each app can be reset to automatic recognition or fully removed from historical sessions when it is no longer needed.
- **Timeline-only minimum segment filter**: The minimum-duration setting only filters Focus Timeline display segments and does not alter real-duration stats.
- **Icon extraction and caching**: Executable icons are extracted natively and cached in SQLite for fast rendering.
- **History and analytics**: Includes daily app rankings, hourly activity, 7-day trends, and a session timeline view.
- **Desktop behavior controls**: Close/minimize behavior, launch at login, and start-minimized behavior are configurable with tray behavior kept consistent.
- **Backup & restore**: Export local backup (`sessions`, `settings`, `icon_cache`) and restore with overwrite confirmation and transactional rollback safety.
- **Stale tracker soft hint + toasts**: Non-blocking stale warning and lightweight toasts for key actions.
- **Data cleanup tools**: Old records can be cleared by retention range such as 7, 15, 30, 60, 90, or 180 days.
- **Polished desktop UI**: Built with Tailwind CSS, Framer Motion, and Recharts.

## Current Settings

- **AFK threshold**: `1 / 3 / 5` minutes
- **Focus timeline minimum segment**: `30s / 1 / 3 / 5 / 10` minutes (display-only, stats are unaffected)
- **Desktop behavior**: close (`exit / tray`), minimize (`taskbar / tray`), launch-at-login, start-minimized
- **History cleanup**: delete records older than `7 / 15 / 30 / 60 / 90 / 180` days
- **App mapping controls**: per-app rename/category/color overrides, exclude from stats, title capture toggle, reset to auto-recognition, and per-app full-history deletion
- **Backup controls**: export backup file and restore from backup file

## Current Timing Pipeline

1. Rust polls foreground window data every `1s` with timeout protection.
2. Session transitions are decided by window identity (`app + process + root owner + class`) instead of only `exe_name`.
3. Lock/sleep boundaries and tracker watchdog sealing prevent stale sessions from leaking duration.
4. Frontend health checks stop live-session growth when tracker sampling is stale.
5. Real stats (`Top Apps`, `Distribution`, `Hourly`, `7-day`) use real active duration; Focus Timeline applies readability merge and minimum-segment filtering only for display.
6. Window-title persistence is decided per app (`captureTitle`) rather than by one global switch.

## Tech Stack

- **Desktop shell**: [Tauri v2](https://v2.tauri.app/)
- **Backend**: Rust
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Database**: SQLite via `@tauri-apps/plugin-sql`
- **Windows integration**: `windows` crate

## Project Docs

- [`docs/architecture-optimization-roadmap.md`](docs/architecture-optimization-roadmap.md): phased architecture optimization plan for future work
- [`docs/timing-algorithm-optimization-plan.md`](docs/timing-algorithm-optimization-plan.md): timing / tracking algorithm optimization plan based on real failure cases
- [`docs/tracking-governed-implementation-plan.md`](docs/tracking-governed-implementation-plan.md): governance checklist for tracking architecture and release safety
- [`docs/session-data-contract.md`](docs/session-data-contract.md): raw session field semantics and read-model contract
- [`docs/app-mapping-governance-plan.md`](docs/app-mapping-governance-plan.md): executable mapping, categorization, and color-governance execution plan
- [`docs/usability-execution-plan.md`](docs/usability-execution-plan.md): end-to-end usability execution checklist (A/B/C/D phases)
- [`docs/backup-restore-rollback.md`](docs/backup-restore-rollback.md): backup format, restore flow, rollback guarantees, and danger-confirm wording

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) 18+

### Install

```bash
git clone https://github.com/182376/time-tracking.git
cd time-tracking
npm install
```

### Run in development

```bash
npm run tauri dev
```

### Build

```bash
npm run build
npm run tauri build
```

## Notes

- Data is stored locally in SQLite.
- The current implementation is Windows-focused because active-window and idle detection rely on Windows APIs.

## License

MIT
