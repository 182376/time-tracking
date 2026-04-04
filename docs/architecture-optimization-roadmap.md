# Architecture Optimization Roadmap

## Purpose

This document is the execution source of truth for incremental architecture work
on this codebase.

It is intentionally conservative:

- keep the current core stack: Rust + Tauri v2 + React + TypeScript
- optimize responsibilities and data flow before introducing new tools
- prefer phased, reversible changes over a big-bang rewrite

This roadmap is broader than the earlier tracking-only cleanup work and covers
ownership boundaries, refresh model, query shape, testing, and engineering
hygiene.

## Current Baseline

### High-level shape

The app is currently a local-first Windows desktop app with this runtime flow:

1. Rust polls the foreground window and AFK state through the Windows API.
2. Rust emits `active-window-changed` to the Tauri webview every 2 seconds.
3. React listens for that event and decides whether to end/start a session.
4. React writes session rows directly into SQLite through `@tauri-apps/plugin-sql`.
5. Dashboard and history views read raw session rows and compile display data in
   TypeScript.

### Current ownership by layer

- Rust / Tauri
  - foreground window detection
  - AFK detection
  - icon extraction
  - SQLite migrations
  - event emission to the frontend
- React / TypeScript
  - session transition decisions
  - startup sealing with heartbeat recovery
  - session writes and updates
  - settings persistence
  - stats compilation
  - history timeline compilation
  - UI rendering

### Current strengths

- The codebase already has a useful separation between native capture, query
  helpers, UI hooks, and view-specific components.
- Tracking compilation behavior is now centralized more than before through
  `sessionCompiler`.
- The app is still small enough that targeted refactors can improve structure
  without a rewrite.

## Main Problems To Solve

### P1. Tracking correctness depends on the webview lifecycle

Rust captures the window state, but the frontend currently owns the session
state machine and database writes. If the webview freezes, reloads, or crashes,
tracking correctness depends on recovery logic rather than on the native layer
remaining authoritative.

### P2. The refresh model is duplicated

The native side emits a window event every 2 seconds, while the frontend also
polls stats on a configurable interval. This creates duplicate work:

- repeated event handling
- repeated database reads
- repeated session compilation

### P3. Data access is spread across UI-facing modules

Hooks and components reach into settings, `invoke`, and raw database helpers
directly. This works today, but it makes later refactors harder because view
logic and persistence details are coupled.

### P4. Aggregation happens repeatedly in the frontend

Dashboard and history both derive their display models in TypeScript from raw
rows. This is correct, but as data grows it will increase:

- client CPU work
- database read volume
- duplicated view-model logic

### P5. Cross-layer contracts are implicit

The Rust event payloads and TypeScript consumer types rely on matching shape and
naming, but there is no explicit shared contract or integration-level safety net.

### P6. Engineering hygiene needs a pass

Several UI files currently contain mojibake/encoding corruption in user-facing
strings. This is not the core architecture problem, but it is a maintenance
risk and should be cleaned up as part of the roadmap.

## Architecture Principles

- Native owns long-lived tracking correctness.
- Frontend focuses on presentation and user interaction.
- Prefer event-driven invalidation over periodic full refresh.
- Keep raw facts in storage; compile or aggregate at well-defined boundaries.
- Optimize boundaries before adding infrastructure.
- Avoid introducing an external backend for this local desktop app.
- Add tests at the seams where responsibility changes.

## Target Architecture

### Desired runtime flow

```text
Windows API
  -> Rust tracker service
  -> Rust session state machine
  -> SQLite
  -> Tauri commands/events
  -> React hooks
  -> UI components
```

### Desired ownership by layer

- Rust / Tauri
  - active window capture
  - AFK detection
  - session transition logic
  - startup sealing / crash recovery
  - session persistence
  - icon extraction and cache fill
  - coarse-grained read models or query commands
- React / TypeScript
  - current UI state
  - page navigation
  - settings form interactions
  - rendering dashboard/history/settings views
  - lightweight live display updates

### Desired frontend boundary

The frontend should consume a small number of application-level entry points
rather than raw persistence helpers, for example:

- `TrackingService`
- `HistoryService`
- `SettingsService`

These may still call Tauri commands or local helpers internally, but components
should not need to know how data is stored or stitched together.

## Scope Boundaries

### In scope

- native/frontend ownership cleanup
- refresh model cleanup
- query and read-model cleanup
- stronger tests around migrations, events, and session behavior
- string/encoding hygiene

### Out of scope for now

- replacing Tauri
- replacing React
- introducing a remote backend or cloud sync
- microservices or IPC between multiple custom processes
- adding a heavy global state library just for architecture polish
- cross-platform tracking support beyond the current Windows focus

## Phased Plan

### Phase 0. Documentation and baseline

Objective:
Create the source-of-truth roadmap and freeze the important current behavior.

Tasks:

- add this document
- record which modules currently own capture, writes, queries, and rendering
- keep tests for current tracking correctness passing before larger moves

Acceptance criteria:

- the team has one document to sequence future work
- future tasks can reference a phase and acceptance criteria directly

### Phase 1. Refresh model cleanup

Objective:
Reduce duplicate refresh work without changing the external feature set.

Tasks:

- stop emitting `active-window-changed` on every identical poll when nothing
  track-relevant changed
- separate "window state changed" from "session data invalidated" if needed
- reduce UI-side full refreshes triggered on timers alone
- keep local live duration display lightweight instead of refetching whole views

Acceptance criteria:

- no visible regression in active app display
- dashboard/history stop doing unnecessary full refresh cycles
- session updates still appear promptly

Notes:

- this phase can be done before moving tracking ownership into Rust
- it should produce an immediate CPU/IO reduction

### Phase 2. Move tracking ownership to Rust

Objective:
Make the native side authoritative for session correctness.

Tasks:

- move transition planning from the React hook into Rust
- move startup sealing / stale session recovery into Rust
- move normal session start/end writes into Rust
- keep the frontend focused on consuming tracker state and rendering it
- preserve existing SQLite schema where possible during the first pass

Acceptance criteria:

- a webview reload does not break or distort session continuity
- only one active session can exist after normal runtime and startup recovery
- AFK backdating still works
- startup sealing still works

Risks:

- this is the most valuable phase, but it changes the deepest ownership boundary
- migrations and rollback strategy should stay simple

### Phase 3. Introduce application services and query boundary

Objective:
Make the frontend depend on stable application-level read/write entry points.

Tasks:

- introduce `TrackingService`, `HistoryService`, and `SettingsService`
- route hot-path reads through service entry points instead of directly through
  components and hooks
- move command/invoke details behind those services
- define a small set of explicit DTOs for the UI

Acceptance criteria:

- components no longer know about raw SQL or low-level persistence helpers
- command payloads and return shapes are explicit and documented in code
- follow-up refactors can change internals without touching every component

### Phase 4. Read-model and aggregation optimization

Objective:
Reduce repeated frontend compilation work for common views.

Tasks:

- identify which dashboard reads can be served by summarized queries
- keep detailed timeline compilation where it still adds value
- consider cached daily summaries or query-level aggregation for:
  - top applications
  - total tracked time
  - seven-day trend summaries
- avoid premature caching for rarely-used or low-cost computations

Acceptance criteria:

- dashboard no longer needs to rebuild every view model from raw rows each time
- history detail remains correct for clipped, merged, and cross-day sessions
- totals remain consistent with compiled source data

### Phase 5. Cross-layer contracts, tests, and observability

Objective:
Make architecture changes safer to evolve.

Tasks:

- formalize Rust <-> TypeScript DTO contracts
- add tests around:
  - migrations
  - startup sealing
  - AFK transitions
  - single-active-session guarantees
  - command/event contract expectations
- add structured logs or at least clearer diagnostic messages in the tracking
  pipeline

Acceptance criteria:

- critical tracking behavior is protected by automated checks
- a contract change across layers is hard to miss
- runtime debugging gets easier during future refactors

### Phase 6. Engineering hygiene and copy cleanup

Objective:
Remove avoidable maintenance friction.

Tasks:

- normalize all source files to UTF-8
- fix mojibake in UI strings and app labels
- consider centralizing user-facing copy to reduce repeated corruption risk
- clean up stale comments or inaccurate names left by earlier refactors

Acceptance criteria:

- user-facing text renders correctly
- future content changes do not reintroduce encoding drift

## Recommended Execution Order

The recommended order is:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 5
6. Phase 4
7. Phase 6

Rationale:

- Phase 1 gives an early performance and clarity win with low risk.
- Phase 2 fixes the highest-value architectural issue.
- Phase 3 makes later work easier to contain.
- Phase 5 reduces the chance of regressions while Phase 4 changes query shape.
- Phase 6 is important, but it should not block ownership and data-flow work.

## What We Should Not Do Yet

- Do not add Redux, Zustand, or another state layer just to "make architecture
  cleaner" unless a concrete state problem appears.
- Do not split this into a networked backend service.
- Do not redesign the UI while the data flow is still being stabilized.
- Do not attempt Windows hook changes and ownership migration in the same phase.

## Immediate Next Tasks

When we start executing this roadmap, the first concrete tasks should be:

1. document the current event and timer refresh paths in code comments or a
   short dev note
2. make the native poll emitter change-aware instead of unconditional
3. reduce redundant UI full refreshes that duplicate the native event loop

These are intentionally smaller than the Rust ownership migration and will give
us a cleaner base before moving the session state machine.

## Definition of Done For The Roadmap

This roadmap can be considered successfully executed when:

- tracking correctness is owned by Rust rather than by the webview
- the frontend consumes stable application services instead of raw DB helpers on
  hot paths
- common read models are cheaper to build than they are today
- cross-layer behavior is covered by automated tests
- user-facing text and codebase hygiene are no longer a distraction
