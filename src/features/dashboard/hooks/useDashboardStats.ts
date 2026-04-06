import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { HistorySession } from "../../../shared/lib/sessionReadRepository";
import { HistoryReadModelService, type DashboardReadModel } from "../../../shared/lib/historyReadModelService";
import type { TrackerHealthSnapshot } from "../../../types/tracking";

export interface UseStatsResult {
  dashboard: DashboardReadModel;
  icons: Record<string, string>;
}

export function useDashboardStats(
  refreshIntervalSecs: number,
  refreshKey: number,
  trackerHealth: TrackerHealthSnapshot,
  mappingVersion: number = 0,
): UseStatsResult {
  const [rawSessions, setRawSessions] = useState<HistorySession[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    try {
      const snapshot = await HistoryReadModelService.loadDashboardSnapshot(new Date());

      startTransition(() => {
        setRawSessions(snapshot.sessions);
        setIcons(snapshot.icons);
        setNowMs(snapshot.fetchedAtMs);
      });
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void fetchData();
  }, [refreshKey, fetchData]);

  useEffect(() => {
    const hasLiveSession = rawSessions.some((session) => session.end_time === null);
    if (!hasLiveSession || trackerHealth.status !== "healthy") {
      return;
    }

    const hasMissingIcons = rawSessions.some((session) => !icons[session.exe_name]);

    const timer = window.setInterval(() => {
      setNowMs(Date.now());

      if (hasMissingIcons) {
        void HistoryReadModelService.loadIconSnapshot()
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
  }, [icons, rawSessions, refreshIntervalSecs, trackerHealth.status]);

  const dashboard = useMemo(
    () => HistoryReadModelService.buildDashboardReadModel(rawSessions, trackerHealth, nowMs),
    [mappingVersion, nowMs, rawSessions, trackerHealth],
  );

  return {
    dashboard,
    icons,
  };
}
