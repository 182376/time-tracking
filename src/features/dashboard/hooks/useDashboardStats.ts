import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { HistorySession } from "../../../shared/lib/sessionReadRepository";
import {
  buildDashboardReadModel,
  loadIconSnapshot,
  type DashboardReadModel,
  type DashboardSnapshot,
} from "../services/dashboardReadModel";
import { getDashboardSnapshotCache } from "../services/dashboardSnapshotCache";
import type { TrackerHealthSnapshot } from "../../../shared/types/tracking";

export interface UseStatsResult {
  dashboard: DashboardReadModel;
  icons: Record<string, string>;
}

export function useDashboardStats(
  refreshIntervalSecs: number,
  refreshKey: number,
  trackerHealth: TrackerHealthSnapshot,
  loadDashboardSnapshot: (date?: Date) => Promise<DashboardSnapshot>,
  mappingVersion: number = 0,
  classificationReady: boolean = true,
): UseStatsResult {
  const initialSnapshot = getDashboardSnapshotCache();
  const [rawSessions, setRawSessions] = useState<HistorySession[]>(
    () => initialSnapshot?.sessions ?? [],
  );
  const [icons, setIcons] = useState<Record<string, string>>(
    () => initialSnapshot?.icons ?? {},
  );
  const [nowMs, setNowMs] = useState(() => initialSnapshot?.fetchedAtMs ?? Date.now());

  const fetchData = useCallback(async () => {
    if (!classificationReady) return;

    try {
      const snapshot = await loadDashboardSnapshot(new Date());

      startTransition(() => {
        setRawSessions(snapshot.sessions);
        setIcons(snapshot.icons);
        setNowMs(snapshot.fetchedAtMs);
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [classificationReady, loadDashboardSnapshot]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void fetchData();
  }, [refreshKey, fetchData]);

  useEffect(() => {
    const hasLiveSession = rawSessions.some((session) => session.end_time === null);
    if (!classificationReady || !hasLiveSession || trackerHealth.status !== "healthy") {
      return;
    }

    const hasMissingIcons = rawSessions.some((session) => !icons[session.exe_name]);

    const timer = window.setInterval(() => {
      setNowMs(Date.now());

      if (hasMissingIcons) {
        void loadIconSnapshot()
          .then((snapshot) => {
            startTransition(() => {
              setIcons(snapshot.icons);
            });
          })
          .catch((error) => {
            console.warn("Failed to refresh icon cache:", error);
          });
      }
    }, refreshIntervalSecs * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [classificationReady, icons, rawSessions, refreshIntervalSecs, trackerHealth.status]);

  const dashboard = useMemo(
    () => buildDashboardReadModel(
      classificationReady ? rawSessions : [],
      trackerHealth,
      nowMs,
    ),
    [classificationReady, mappingVersion, nowMs, rawSessions, trackerHealth],
  );

  return {
    dashboard,
    icons,
  };
}
