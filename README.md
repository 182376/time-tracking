# Time Tracker

Time Tracker is a local-first Windows desktop app that automatically records which app you are actively using and turns that activity into a clean dashboard, a readable history view, and a calm focus timeline.

Built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

## Why this project exists

Most time trackers either ask you to start and stop timers manually, or they log foreground windows in a way that quickly stops feeling trustworthy.

Time Tracker is built around a simpler promise:

- track activity automatically
- keep the data local
- handle real desktop boundaries more carefully
- make the result readable enough to use every day

It is designed as a personal desktop tool first, not a team SaaS product or a productivity game.

## What it does today

- Automatically tracks the app you are actively using
- Builds a daily dashboard with top apps, hourly activity, trends, and recent summaries
- Shows a readable History timeline for reviewing your day
- Lets you rename, recolor, reclassify, and exclude apps from stats
- Lets you enable or disable window title capture per app
- Supports backup, restore, and history cleanup
- Supports desktop behaviors such as tray/minimize options and launch-at-login

## Why it feels trustworthy

Time tracking only works if the numbers feel believable. The project currently leans on a few core behaviors to protect that trust:

- **Native window tracking** via Rust and the Windows API
- **AFK-aware timing** so idle time is not silently counted as active work
- **Lock and sleep boundaries** so sessions do not leak through breaks
- **Crash-safe recovery** so stale active sessions get sealed near the last known live point
- **System app filtering** so user-facing stats stay cleaner
- **Real-duration stats** so totals are based on actual active time, not just visual spans

## How to read the data

Three rules matter when you compare the dashboard with the focus timeline:

1. Stats use real active duration.
2. The focus timeline may merge short interruptions for readability.
3. The minimum segment filter only changes timeline display, not totals.

That means the timeline can look visually simplified while the totals still remain accurate.

## Privacy and data

- All core data is stored locally in **SQLite**
- No account, cloud sync, or server dependency is required for normal use
- Title capture can be disabled per app
- Backups currently include `sessions`, `settings`, and `icon_cache`

## Current scope

Time Tracker is currently focused on a narrow but intentional scope:

- **Windows 10/11 desktop first**
- **Personal use first**
- **Local-first storage and control**

It is not currently aimed at:

- team collaboration
- cloud-first workflows
- mobile-first usage
- multi-platform parity

## Getting started

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

### Run tests

```bash
npm test
npm run test:replay
cd src-tauri
cargo test
```

### Build

```bash
npm run build
npm run tauri build
```

Bundled installers are generated under `src-tauri/target/release/bundle/`.

## Tech stack

- **Desktop shell**: [Tauri v2](https://v2.tauri.app/)
- **Backend**: Rust
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Database**: SQLite via `@tauri-apps/plugin-sql`
- **Windows integration**: `windows` crate

## Project docs

For long-lived project references, see:

- [`docs/product-principles-and-scope.md`](docs/product-principles-and-scope.md)
- [`docs/roadmap-and-prioritization.md`](docs/roadmap-and-prioritization.md)
- [`docs/architecture-target.md`](docs/architecture-target.md)
- [`docs/quiet-pro-component-guidelines.md`](docs/quiet-pro-component-guidelines.md)
- [`docs/versioning-and-release-policy.md`](docs/versioning-and-release-policy.md)

## Feedback

- Releases: <https://github.com/182376/time-tracking/releases>
- Issues: <https://github.com/182376/time-tracking/issues/new/choose>

## License

MIT
