import type { HistorySession, StoredDerivedSession } from "../db";

type ComparisonStatus = "match" | "expected_change" | "regression_candidate";

export interface AppDurationDiff {
  exe_name: string;
  legacy_duration_ms: number;
  derived_duration_ms: number;
  delta_ms: number;
  status: ComparisonStatus;
}

export interface SessionDiffItem {
  kind: "legacy_only" | "derived_only" | "overlap_mismatch";
  status: Exclude<ComparisonStatus, "match">;
  legacy_ids: number[];
  derived_ids: number[];
  start_time_ms: number;
  end_time_ms: number;
  legacy_duration_ms: number;
  derived_duration_ms: number;
  reason: string;
}

export interface DayComparisonReport {
  legacy_total_duration_ms: number;
  derived_total_duration_ms: number;
  total_delta_ms: number;
  app_diffs: AppDurationDiff[];
  session_diffs: SessionDiffItem[];
}

function isExpectedCutReason(reason: string) {
  return reason === "idle" || reason === "lock" || reason === "suspend" || reason === "shutdown";
}

function normalizeLegacySession(session: HistorySession) {
  return {
    id: session.id,
    exe_name: session.exe_name,
    start_time_ms: session.start_time,
    end_time_ms: session.end_time ?? (session.start_time + Math.max(0, session.duration ?? 0)),
    duration_ms: Math.max(0, session.duration ?? 0),
  };
}

function normalizeDerivedSession(session: StoredDerivedSession) {
  return {
    id: session.id,
    exe_name: session.exe_name,
    start_time_ms: session.start_time_ms,
    end_time_ms: session.end_time_ms,
    duration_ms: session.duration_ms,
    cut_reason: session.cut_reason,
  };
}

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
}

export function compareDaySessions(
  legacySessions: HistorySession[],
  derivedSessions: StoredDerivedSession[],
): DayComparisonReport {
  const legacy = legacySessions.map(normalizeLegacySession);
  const derived = derivedSessions.map(normalizeDerivedSession);

  const appKeys = new Set([
    ...legacy.map((session) => session.exe_name),
    ...derived.map((session) => session.exe_name),
  ]);

  const app_diffs = Array.from(appKeys)
    .map((exe_name) => {
      const legacy_duration_ms = legacy
        .filter((session) => session.exe_name === exe_name)
        .reduce((sum, session) => sum + session.duration_ms, 0);
      const derivedForApp = derived.filter((session) => session.exe_name === exe_name);
      const derived_duration_ms = derivedForApp
        .reduce((sum, session) => sum + session.duration_ms, 0);
      const delta_ms = derived_duration_ms - legacy_duration_ms;
      const status: ComparisonStatus =
        delta_ms === 0
          ? "match"
          : delta_ms < 0 && derivedForApp.some((session) => isExpectedCutReason(session.cut_reason))
            ? "expected_change"
            : "regression_candidate";

      return {
        exe_name,
        legacy_duration_ms,
        derived_duration_ms,
        delta_ms,
        status,
      };
    })
    .sort((a, b) => Math.abs(b.delta_ms) - Math.abs(a.delta_ms));

  const session_diffs: SessionDiffItem[] = [];
  const matchedLegacyIds = new Set<number>();

  for (const derivedSession of derived) {
    const overlappingLegacy = legacy.filter((legacySession) =>
      intervalsOverlap(
        derivedSession.start_time_ms,
        derivedSession.end_time_ms,
        legacySession.start_time_ms,
        legacySession.end_time_ms,
      ),
    );

    if (overlappingLegacy.length === 0) {
      session_diffs.push({
        kind: "derived_only",
        status: "regression_candidate",
        legacy_ids: [],
        derived_ids: [derivedSession.id],
        start_time_ms: derivedSession.start_time_ms,
        end_time_ms: derivedSession.end_time_ms,
        legacy_duration_ms: 0,
        derived_duration_ms: derivedSession.duration_ms,
        reason: `derived_only:${derivedSession.cut_reason}`,
      });
      continue;
    }

    overlappingLegacy.forEach((session) => matchedLegacyIds.add(session.id));

    const legacyDuration = overlappingLegacy.reduce(
      (sum, session) => sum + session.duration_ms,
      0,
    );
    const earliestStart = Math.min(
      derivedSession.start_time_ms,
      ...overlappingLegacy.map((session) => session.start_time_ms),
    );
    const latestEnd = Math.max(
      derivedSession.end_time_ms,
      ...overlappingLegacy.map((session) => session.end_time_ms),
    );

    const isMismatch =
      legacyDuration !== derivedSession.duration_ms ||
      overlappingLegacy.some(
        (session) =>
          session.start_time_ms !== derivedSession.start_time_ms ||
          session.end_time_ms !== derivedSession.end_time_ms,
      );

    if (isMismatch) {
      session_diffs.push({
        kind: "overlap_mismatch",
        status:
          derivedSession.duration_ms <= legacyDuration &&
          isExpectedCutReason(derivedSession.cut_reason)
            ? "expected_change"
            : "regression_candidate",
        legacy_ids: overlappingLegacy.map((session) => session.id),
        derived_ids: [derivedSession.id],
        start_time_ms: earliestStart,
        end_time_ms: latestEnd,
        legacy_duration_ms: legacyDuration,
        derived_duration_ms: derivedSession.duration_ms,
        reason: `cut_reason:${derivedSession.cut_reason}`,
      });
    }
  }

  for (const legacySession of legacy) {
    if (matchedLegacyIds.has(legacySession.id)) continue;

    session_diffs.push({
      kind: "legacy_only",
      status: "regression_candidate",
      legacy_ids: [legacySession.id],
      derived_ids: [],
      start_time_ms: legacySession.start_time_ms,
      end_time_ms: legacySession.end_time_ms,
      legacy_duration_ms: legacySession.duration_ms,
      derived_duration_ms: 0,
      reason: "legacy_only",
    });
  }

  return {
    legacy_total_duration_ms: legacy.reduce((sum, session) => sum + session.duration_ms, 0),
    derived_total_duration_ms: derived.reduce((sum, session) => sum + session.duration_ms, 0),
    total_delta_ms:
      derived.reduce((sum, session) => sum + session.duration_ms, 0) -
      legacy.reduce((sum, session) => sum + session.duration_ms, 0),
    app_diffs,
    session_diffs: session_diffs.sort((a, b) => a.start_time_ms - b.start_time_ms),
  };
}
