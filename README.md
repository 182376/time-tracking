# Time Tracker

Time Tracker is a local-first Windows desktop app that automatically records the app you are actively using, then turns that activity into a readable dashboard, a clear history view, and a calmer picture of how your work time is actually spent.

Built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

## Why this exists

Many time trackers fall into one of two traps:

- they depend on manual start/stop timers
- they record foreground activity in a way that quickly stops feeling trustworthy

Time Tracker is built around a narrower promise:

- track activity automatically
- keep the data local
- handle real desktop boundaries more carefully
- make the result readable enough to use every day

It is designed as a **personal desktop tool first**, not a team SaaS product, a cloud-first workflow, or a gamified productivity app.

## What you get

- Automatic foreground app tracking
- Daily dashboard with top apps, category distribution, and hourly activity
- History view for reviewing the selected day and the recent past
- App mapping workspace with support for:
  - renaming apps
  - overriding categories
  - overriding colors
  - excluding apps from stats
  - disabling title capture per app
  - deleting historical sessions
- Explicit save/cancel flow in settings
- Local backup export and restore
- History retention cleanup
- Desktop behaviors such as tray, minimize, and launch-at-login options

## Why the numbers feel trustworthy

Time tracking only matters if the result feels believable. The project currently leans on a few core behaviors to protect that trust:

- **Native window tracking** through Rust and the Windows API
- **AFK-aware timing** so idle time is not silently counted as active time
- **Lock and sleep boundary handling** so sessions do not leak across breaks
- **Crash-safe recovery** so stale live sessions are sealed near the last known healthy heartbeat
- **System app filtering** so user-facing stats stay cleaner
- **Real-duration stats** so totals are based on active time, not just visual spans

## Current scope

Time Tracker is intentionally narrow right now:

- **Windows 10/11 first**
- **Personal use first**
- **Local-first storage and control**

It is not currently aimed at:

- team collaboration
- cloud-first workflows
- mobile-first usage
- multi-platform parity

## Download

Prebuilt releases are published on GitHub:

- Releases: <https://github.com/182376/time-tracking/releases>

If you just want to use the app, start there.

## Privacy and data

- Core data is stored locally in **SQLite**
- No account, cloud sync, or server dependency is required for normal use
- Title capture can be disabled per app
- Backups currently include `sessions`, `settings`, and `icon_cache`

## Build from source

### Requirements

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

### Run checks

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

Bundled installers are generated under:

```text
src-tauri/target/release/bundle/
```

## Tech stack

- Desktop shell: Tauri v2
- Backend: Rust
- Frontend: React + Vite + TypeScript
- Styling: Tailwind CSS
- Animation: Framer Motion
- Charts: Recharts
- Database: SQLite via `@tauri-apps/plugin-sql`
- Windows integration: `windows` crate

## Project docs

If you are contributing or reviewing the project direction, start with:

- [`docs/product-principles-and-scope.md`](docs/product-principles-and-scope.md)
- [`docs/roadmap-and-prioritization.md`](docs/roadmap-and-prioritization.md)
- [`docs/engineering-quality-target.md`](docs/engineering-quality-target.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/quiet-pro-component-guidelines.md`](docs/quiet-pro-component-guidelines.md)
- [`docs/versioning-and-release-policy.md`](docs/versioning-and-release-policy.md)

## Feedback

- Releases: <https://github.com/182376/time-tracking/releases>
- Issues: <https://github.com/182376/time-tracking/issues/new/choose>

## License

MIT
