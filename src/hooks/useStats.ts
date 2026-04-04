import { useEffect, useState, useCallback } from "react";
import { AppStat } from "../types/app";
import { getHistoryByDate, getIconMap, type HistorySession } from "../lib/db";
import { buildNormalizedAppStats, compileSessions, getDayRange } from "../lib/services/sessionCompiler";

export interface UseStatsResult {
  stats: AppStat[];
  icons: Record<string, string>;
  todaySessions: HistorySession[];
  refreshNow: () => Promise<void>;
}

export function useStats(refreshIntervalSecs: number, refreshKey: number, minSessionSecs: number): UseStatsResult {
  const [stats, setStats] = useState<AppStat[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [todaySessions, setTodaySessions] = useState<HistorySession[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [sessions, iconsData] = await Promise.all([
        getHistoryByDate(new Date()),
        getIconMap(),
      ]);
      const dayRange = getDayRange(new Date());
      const compiledSessions = compileSessions(sessions || [], {
        startMs: dayRange.startMs,
        endMs: dayRange.endMs,
        minSessionSecs,
      });
      setStats(buildNormalizedAppStats(compiledSessions));
      setIcons(iconsData || {});
      setTodaySessions(compiledSessions);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [minSessionSecs]);

  useEffect(() => {
    void fetchData();

    const timer = window.setInterval(() => {
      void fetchData();
    }, refreshIntervalSecs * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshIntervalSecs, fetchData]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void fetchData();
  }, [refreshKey, fetchData]);

  return {
    stats,
    icons,
    todaySessions,
    refreshNow: fetchData,
  };
}
