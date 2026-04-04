# Tracking Refactor Task

## Context

The current tracker stores window-driven sessions well enough for a basic dashboard,
but the counting pipeline still has a few accuracy problems:

- session boundaries depend on `window_title`, which fragments one continuous app session
- short sessions are deleted at write time, so data is lost permanently
- day queries use `start_time`, so cross-day sessions are attributed incorrectly
- timeline grouping stretches duration across interruption gaps
- stats, timeline, and chart views do not share one compilation pipeline

This task refactors the tracking flow so storage keeps raw facts and the UI compiles
those facts into day-bound, filter-aware, display-friendly results.

## Goals

1. Stop splitting sessions when only the window title changes.
2. Keep raw segments in SQLite and move minimum-duration filtering to compile time.
3. Query sessions by time overlap so cross-day activity is counted in the correct day.
4. Introduce one session compiler used by dashboard stats, history summary, and timeline.
5. Keep timeline grouping for readability without inflating active duration.
6. Add tests that lock in the new behavior.

## Non-Goals

- No schema migration for raw event storage.
- No WinEvent hook migration in this pass.
- No redesign of the dashboard or history UI.

## Target Behavior

### Tracking state machine

- Tracking identity is based on a track key derived from `exe_name`.
- Title changes update metadata only; they do not close and reopen sessions.
- AFK still closes the active session and backdates the end time to the last input point.
- Startup sealing still uses the saved heartbeat to cap stale open sessions.

### Storage rules

- SQLite keeps raw segments as written by the tracker.
- Closing a session only sets `end_time` and `duration`.
- Minimum session filtering is applied after compilation, not during writes.

### Query and compilation rules

- Day queries include any session that overlaps the target range.
- Compiled sessions are clipped to the requested range before aggregation.
- Adjacent same-app fragments inside a short direct gap are merged before filtering.
- App stats are built from compiled sessions.
- Timeline groups can span short interruptions, but `duration` remains the sum of
  active segments rather than the full wall-clock span.

## Implementation Plan

### Phase 1: Documentation

- Add this task document to capture scope, acceptance criteria, and verification.

### Phase 2: Tracking lifecycle updates

- Change the transition planner so `window_title` does not trigger a session split.
- Keep AFK and startup sealing logic unchanged.

### Phase 3: Raw query updates

- Add a reusable range query for sessions that overlap `[start, end)`.
- Update day/history queries to use overlap instead of `start_time` only.
- Stop deleting short sessions when closing the active session.

### Phase 4: Session compiler

- Add a compiler that:
  - clips raw sessions into a requested range
  - merges direct same-app gaps
  - applies minimum-session filtering after merge
  - builds app stats
  - builds timeline groups without counting interruption gaps as active duration
  - builds 7-day summaries by distributing compiled durations to the correct day

### Phase 5: Consumer wiring

- Update `useStats` to compile today sessions before building dashboard stats.
- Update `History` to compile selected-day sessions and 7-day summaries.
- Keep dashboard hourly activity based on compiled sessions clipped to the day.

### Phase 6: Verification

- Extend tests for:
  - same-app title changes staying in one session
  - short-session filtering after merge
  - cross-day clipping and daily attribution
  - timeline grouping preserving active duration

## Acceptance Criteria

- Switching files or tabs inside the same executable no longer creates a new session.
- Segments shorter than the minimum threshold remain in storage but disappear from
  compiled dashboard/history output when appropriate.
- A session spanning midnight contributes time to both calendar days correctly.
- Timeline entries can stay visually continuous across short interruptions without
  overstating active duration.
- Automated tests cover the new behavior and pass locally.

## Risks

- Existing history views may show fewer fragments than before because title-only splits
  disappear.
- Keeping raw micro-sessions increases stored row count slightly.
- Cross-day fixes may change historical totals that were previously attributed to the
  wrong day.

## Verification Notes

- Use the existing Node test entrypoint in `tests/trackingLifecycle.test.ts`.
- Focus on deterministic compiler tests instead of UI snapshot tests for this pass.
