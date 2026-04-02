# Time Tracker

A native desktop time tracker built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

It watches the active window on Windows, records app sessions locally, and turns them into a clean daily dashboard plus a readable history timeline.

## Features

- **Native window tracking**: Uses Rust and the Windows API to detect the current foreground app with low overhead.
- **Smart AFK handling**: One shared AFK threshold controls both idle cutoff and timeline continuity. If you go idle for longer than the threshold, the current session is cut back to the threshold boundary instead of counting the whole idle period.
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
