import { motion } from "framer-motion";
import { Monitor, BarChart3 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import { useIconThemeColors } from "../../../shared/hooks/useIconThemeColors";
import { formatDashboardDuration } from "../services/dashboardFormatting";
import type { DashboardReadModel } from "../services/dashboardReadModel";
import { AppClassification } from "../../../shared/classification/appClassification.ts";
import QuietChartTooltip from "../../../shared/components/QuietChartTooltip";
import QuietPageHeader from "../../../shared/components/QuietPageHeader";

interface Props {
  dashboard: DashboardReadModel;
  icons: Record<string, string>;
  isAfk: boolean;
  isTrackingActive: boolean;
  activeAppName: string | null;
  trackingPaused: boolean;
}

export default function Dashboard({
  dashboard,
  icons,
  isAfk,
  isTrackingActive,
  activeAppName,
  trackingPaused,
}: Props) {
  const iconThemeColors = useIconThemeColors(icons);
  const {
    totalTrackedTime,
    topApplications,
    hourlyActivity,
    categoryDist,
  } = dashboard;
  const runtimeStateLabel = trackingPaused
    ? UI_TEXT.dashboard.paused
    : isAfk
      ? UI_TEXT.dashboard.afk
      : isTrackingActive
        ? UI_TEXT.dashboard.active
        : UI_TEXT.dashboard.idle;
  const runtimeStateToneClass = trackingPaused || isAfk
    ? "bg-[var(--qp-warning)]"
    : isTrackingActive
      ? "bg-[var(--qp-success)]"
      : "bg-[var(--qp-border-strong)]";

  return (
    <div className="flex flex-col gap-4 md:gap-5 h-full overflow-hidden">
      <QuietPageHeader
        icon={<Monitor size={18} />}
        title={UI_TEXT.dashboard.title}
        subtitle={(
          <span className="flex items-center gap-1.5 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                trackingPaused
                  ? "bg-[var(--qp-warning)]"
                  : activeAppName
                    ? "bg-[var(--qp-success)]"
                    : "bg-[var(--qp-border-strong)]"
              }`}
            />
            {trackingPaused
              ? UI_TEXT.dashboard.trackingPaused
              : activeAppName
                ? UI_TEXT.dashboard.tracking(activeAppName)
                : UI_TEXT.dashboard.idle}
          </span>
        )}
        rightSlot={(
          <div className="qp-status px-3 py-1.5 flex items-center gap-2 shrink-0">
            <span className={`w-2 h-2 rounded-full ${runtimeStateToneClass}`} />
            <span className="text-[11px] font-semibold text-[var(--qp-text-secondary)]">
              {runtimeStateLabel}
            </span>
          </div>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden pr-1">
        <div className="lg:col-span-4 flex flex-col gap-4 md:gap-5 min-h-0 dashboard-left-column">
          <div className="qp-panel p-5 md:p-6 flex flex-col items-center relative overflow-hidden shrink-0 min-h-[320px] dashboard-focus-card">
            <h3 className="w-full text-[var(--qp-text-primary)] font-semibold text-sm mb-4">{UI_TEXT.dashboard.focusShare}</h3>
            <div className="relative w-full h-[180px] dashboard-focus-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryDist} innerRadius="70%" outerRadius="100%" paddingAngle={6} dataKey="value" stroke="none">
                      {categoryDist.map((item, index) => (
                        <Cell key={`cell-${index}`} fill={item.color || "var(--qp-accent-default)"} />
                    ))}
                  </Pie>
                  <QuietChartTooltip formatter={(v) => formatDashboardDuration(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-semibold text-[var(--qp-text-primary)] tabular-nums">
                  {formatDashboardDuration(totalTrackedTime)}
                </span>
                <span className="text-[9px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.12em]">{UI_TEXT.dashboard.total}</span>
              </div>
            </div>
            <div className="mt-6 w-full space-y-2 dashboard-focus-legend">
              {categoryDist.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--qp-text-secondary)]">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color || "var(--qp-accent-default)" }} />
                    {cat.name}
                  </div>
                  <span className="text-[var(--qp-text-tertiary)] font-medium tabular-nums">{formatDashboardDuration(cat.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="qp-panel p-5 flex-1 min-h-0 flex flex-col overflow-hidden dashboard-pulse-card">
            <h3 className="text-[var(--qp-text-primary)] font-semibold text-sm mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-[var(--qp-accent-default)] flex-shrink-0" />
              {UI_TEXT.dashboard.hourlyActivity}
            </h3>
            <div className="flex-1 min-h-[170px] dashboard-pulse-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyActivity} margin={{ top: 6, right: 12, left: 10, bottom: 4 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 8, fill: "var(--qp-text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    interval={5}
                    padding={{ left: 12, right: 12 }}
                  />
                  <YAxis hide domain={[0, 60]} allowDataOverflow />
                  <QuietChartTooltip
                    cursor={{ fill: "rgba(101, 114, 135, 0.12)" }}
                    formatter={(v) => [`${Math.round(Number(v))}m`, UI_TEXT.dashboard.activeMinutes]}
                  />
                  <Bar dataKey="minutes" fill="var(--qp-accent-default)" radius={[3, 3, 0, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 qp-panel p-5 md:p-6 flex flex-col overflow-hidden min-h-[420px] lg:min-h-0">
          <header className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-[var(--qp-text-primary)] text-base">{UI_TEXT.dashboard.topApps}</h3>
            <div className="qp-chip px-2.5 py-1 text-[10px] font-semibold text-[var(--qp-text-secondary)]">
              {UI_TEXT.dashboard.topAppsBadge(topApplications.length)}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto pr-1 md:pr-2 space-y-2.5 custom-scrollbar">
            {topApplications.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-[var(--qp-text-tertiary)] gap-2">
                <Monitor size={32} className="opacity-40" />
                <p className="text-sm font-medium mt-2">{UI_TEXT.dashboard.emptyState}</p>
              </div>
            )}
            {topApplications.map((app) => (
              (() => {
                const overrideColor = AppClassification.getUserOverride(app.exeName)?.color;
                const accentColor = overrideColor ?? iconThemeColors[app.exeName] ?? app.color;

                return (
                  <div
                    key={app.exeName}
                    className="flex items-center justify-between px-3.5 py-3 border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] rounded-[10px] hover:border-[var(--qp-border-strong)] hover:bg-[var(--qp-bg-panel)] transition-colors cursor-default"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div
                        className="w-10 h-10 bg-[var(--qp-bg-panel)] rounded-[8px] flex items-center justify-center border border-[var(--qp-border-subtle)] overflow-hidden p-2"
                        style={{
                          boxShadow: `0 0 0 2px ${accentColor}22`,
                        }}
                      >
                        {icons[app.exeName] ? (
                          <img src={icons[app.exeName]} className="w-full h-full object-contain" alt="" />
                        ) : (
                          <div className="text-xs font-semibold opacity-40 text-[var(--qp-text-secondary)]">{app.categoryInitial}</div>
                        )}
                      </div>
                      <div className="truncate">
                        <div className="font-semibold text-[var(--qp-text-primary)] text-sm truncate flex items-center gap-2">
                          <span className="truncate">{app.name}</span>
                        </div>
                        <div className="text-[10px] text-[var(--qp-text-tertiary)] font-medium mt-0.5 tabular-nums">
                          {UI_TEXT.dashboard.sharePrefix} {app.percentage}%
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4 flex-shrink-0">
                      <div className="font-semibold text-[var(--qp-text-primary)] text-sm tabular-nums">
                        {formatDashboardDuration(app.duration)}
                      </div>
                      <div className="w-20 h-1.5 bg-[var(--qp-track-muted)] rounded-full mt-2.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${app.percentage}%` }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: accentColor }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
