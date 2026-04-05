# Time Tracker

Time Tracker is a local-first Windows desktop app that automatically records which app you are actively using and turns it into a clean daily dashboard, a readable history view, and a focus timeline.

Built with **Rust**, **Tauri v2**, **React**, and **TypeScript**.

**What you get**

- Automatic app tracking, without manually starting and stopping timers
- Local-only storage, with no account or cloud required
- Timing that handles AFK, lock screen, and sleep more carefully than a simple foreground-app logger
- App cleanup tools so your reports stay readable instead of messy

## Why It Feels Trustworthy

- **Native window tracking**: Uses Rust and the Windows API to detect the current foreground app with low overhead.
- **AFK-aware timing**: If you go idle longer than the configured threshold, the current session is cut back to the threshold boundary instead of counting the whole idle period.
- **Lock and sleep boundaries**: Windows lock/unlock and suspend/resume events end sessions at system boundaries instead of leaking through breaks or sleep.
- **Crash-safe sealing and watchdog recovery**: The tracker stores a lightweight local heartbeat and seals stale active sessions near the last live sample instead of letting them run forever.
- **System app filtering**: System-level apps such as Explorer, Terminal, and Task Manager are filtered out of user-facing stats.
- **Real-duration stats**: Rankings, distributions, hourly activity, and rolling summaries stay on real active duration instead of timeline display spans.

## What You Can Do

- See **Top Apps**, **Hourly Activity**, **7-day trends**, and a daily **History** timeline
- Review all observed apps in a dedicated **App Classification & Color** page
- Rename, recolor, and reclassify apps globally
- Exclude apps from stats when they should not count
- Turn **window title capture** on or off per app
- Reset an app to automatic recognition or delete its historical sessions
- Control **close/minimize behavior**, **launch at login**, and **start minimized**
- Export a local backup and restore it later with overwrite confirmation and rollback safety
- Clean up old records by retention range

## How To Read The Numbers

These three rules matter when you compare the dashboard with the timeline:

1. **Stats use real active duration.**
2. **The Focus Timeline may merge short interruptions for readability.**
3. **The minimum segment filter only affects timeline display, not totals.**

That means a timeline can look visually simplified while the totals still stay accurate.

## Good First-Run Setup

If you want a solid setup in the first few minutes, start here:

1. Set your **AFK threshold** to `1 / 3 / 5` minutes
2. Choose your **close behavior**: `exit` or `tray`
3. Choose your **minimize behavior**: `taskbar` or `tray`
4. Decide whether to enable **launch at login** and **start minimized**
5. Open **App Classification & Color** and fix the few apps you care about most
6. Export a backup once your setup looks right

## Privacy And Data

- All data is stored locally in **SQLite**
- Backups include `sessions`, `settings`, and `icon_cache`
- Title capture can be disabled per app
- No account, cloud sync, or server dependency is required for normal use

## Current Settings

- **AFK threshold**: `1 / 3 / 5` minutes
- **Focus timeline minimum segment**: `30s / 1 / 3 / 5 / 10` minutes
- **Desktop behavior**: close (`exit / tray`), minimize (`taskbar / tray`), launch-at-login, start-minimized
- **History cleanup**: delete records older than `7 / 15 / 30 / 60 / 90 / 180` days
- **App mapping controls**: rename, category override, color override, exclude from stats, title capture toggle, reset, full-history deletion
- **Backup controls**: export backup file and restore from backup file

## Current Tracking Model

At a high level, the app works like this:

1. Rust polls foreground window data every `1s` with timeout protection.
2. Session transitions use window identity (`app + process + root owner + class`) instead of only `exe_name`.
3. Lock/sleep boundaries and watchdog sealing prevent stale sessions from leaking duration.
4. Frontend health checks stop live-session growth when tracker sampling is stale.
5. Stats stay on real active duration, while the Focus Timeline applies readability merge and minimum-segment filtering only for display.
6. Window-title persistence is controlled per app through `captureTitle`.

## Current Limitations

- The current implementation is **Windows-focused** because active-window and idle detection rely on Windows APIs.
- This project is best suited for **Windows 10/11 desktop usage** today.
- Cloud sync and multi-platform support are not part of the current release scope.

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

### Run In Development

```bash
npm run tauri dev
```

### Run Tests

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

## Tech Stack

- **Desktop shell**: [Tauri v2](https://v2.tauri.app/)
- **Backend**: Rust
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Database**: SQLite via `@tauri-apps/plugin-sql`
- **Windows integration**: `windows` crate

## Release And Project Docs

- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md): pre-release build, regression, data safety, and packaging checklist
- [`RELEASE_STRATEGY.md`](RELEASE_STRATEGY.md): staged gray-rollout strategy and go/no-go rules

## Feedback

- Releases: <https://github.com/182376/time-tracking/releases>
- Issues: <https://github.com/182376/time-tracking/issues/new/choose>

## License

MIT
