# Time Tracker

A native desktop time tracker built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

It watches the active window on Windows, records app sessions locally, and turns them into a clean daily dashboard plus a readable history timeline.

## Features

- **Native window tracking**: Uses Rust and the Windows API to detect the current foreground app with low overhead.
- **Smart AFK handling**: One shared AFK threshold controls both idle cutoff and timeline continuity. If you go idle for longer than the threshold, the current session is cut back to the threshold boundary instead of counting the whole idle period.
- **Power-aware lifecycle tracking**: Lock, unlock, suspend, resume, startup, and shutdown events are captured as raw lifecycle facts for more reliable boundary handling.
- **Raw event pipeline**: Window and presence snapshots are stored as raw events beside legacy sessions, creating a rebuildable audit trail.
- **Crash-tolerant event queue**: Raw tracking events are queued locally and replayed on startup before being flushed into the raw event tables.
- **Derived session compiler**: A compiler rebuilds canonical sessions from raw window, presence, and power events to support a safer event-first architecture.
- **Timeline merging**: Brief interruptions inside the AFK threshold are merged back into one continuous activity block for easier reading.
- **System app filtering**: System-level apps such as Explorer, Terminal, and Task Manager are excluded from tracked results.
- **Micro-session filtering**: Very short sessions can be ignored to keep data cleaner.
- **Icon extraction and caching**: Executable icons are extracted natively and cached in SQLite for fast rendering.
- **History and analytics**: Includes daily app rankings, hourly activity, 7-day trends, and a session timeline view.
- **Data cleanup tools**: Old records can be cleared by retention range such as 7, 15, 30, 60, 90, or 180 days.
- **Polished desktop UI**: Built with Tailwind CSS, Framer Motion, and Recharts.

## Current Settings

- **AFK threshold**: `1 / 3 / 5` minutes
- **Minimum session length**: `30s / 1 / 3 / 5 / 10` minutes
- **UI refresh interval**: `1 / 3 / 5 / 10` seconds
- **History cleanup**: delete records older than `7 / 15 / 30 / 60 / 90 / 180` days

## Tech Stack

- **Desktop shell**: [Tauri v2](https://v2.tauri.app/)
- **Backend**: Rust
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Database**: SQLite via `@tauri-apps/plugin-sql`
- **Windows integration**: `windows` crate

## Tracking Core Status

The tracking core is currently in a staged migration from a direct `session-first` model to a safer `raw-event-first` model.

Already implemented:

- raw window, presence, and power event tables
- startup replay for queued raw events
- power lifecycle capture for `startup`, `shutdown`, `lock`, `unlock`, `suspend`, and `resume`
- a `derived_sessions` compiler that rebuilds canonical sessions from raw facts
- lifecycle and compiler regression tests

Current rollout status:

- the app still keeps the legacy `sessions` path for the user-facing dashboard and history
- raw events and `derived_sessions` are already being collected in parallel
- the diff/review tooling and final UI cutover are still in progress

Design and migration notes:

- [`docs/tracking-architecture-plan.md`](docs/tracking-architecture-plan.md)
- [`docs/phase-0-tracking-audit.md`](docs/phase-0-tracking-audit.md)

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

### Run tests

```bash
npm test
```

## Notes

- Data is stored locally in SQLite.
- The current implementation is Windows-focused because active-window and idle detection rely on Windows APIs.

## License

MIT
