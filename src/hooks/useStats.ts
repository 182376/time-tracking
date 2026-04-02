import { useEffect, useState, useCallback } from "react";
import { AppStat } from "../types/app";
import { getHistoryByDate, getIconMap } from "../lib/db";
import { buildNormalizedAppStats } from "../lib/services/history";

export interface UseStatsResult {
  stats: AppStat[];
  icons: Record<string, string>;
  todaySessions: any[];
  refreshNow: () => Promise<void>;
}

export function useStats(refreshIntervalSecs: number, refreshKey: number): UseStatsResult {
  const [stats, setStats] = useState<AppStat[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [todaySessions, setTodaySessions] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [sessions, iconsData] = await Promise.all([
        getHistoryByDate(new Date()),
        getIconMap(),
      ]);
      setStats(buildNormalizedAppStats(sessions || []));
      setIcons(iconsData || {});
      setTodaySessions(sessions || []);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

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
