export interface AppStat {
  app_name: string;
  exe_name: string;
  total_duration: number;
  suspicious_duration: number;
}

export type View = "dashboard" | "history" | "settings";
