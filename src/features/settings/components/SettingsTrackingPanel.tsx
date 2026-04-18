import { Clock, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import QuietSwitch from "../../../shared/components/QuietSwitch";

type MinuteControlProps = {
  label: string;
  hint: ReactNode;
  minutes: number;
  minMinutes: number;
  maxMinutes: number;
  onMinutesChange: (nextMinutes: number) => void;
};

type SettingsTrackingPanelProps = {
  idleTimeoutControl: MinuteControlProps;
  timelineMergeGapControl: MinuteControlProps;
  minSessionControl: MinuteControlProps;
  trackingPaused: boolean;
  onTrackingPausedChange: (nextChecked: boolean) => void;
};

const clampMinute = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type MinuteStepperSliderProps = {
  ariaLabel: string;
  minutes: number;
  minMinutes: number;
  maxMinutes: number;
  onMinutesChange: (nextMinutes: number) => void;
};

function MinuteStepperSlider({
  ariaLabel,
  minutes,
  minMinutes,
  maxMinutes,
  onMinutesChange,
}: MinuteStepperSliderProps) {
  const canDecrease = minutes > minMinutes;
  const canIncrease = minutes < maxMinutes;
  const updateMinutes = (nextMinutes: number) => onMinutesChange(clampMinute(nextMinutes, minMinutes, maxMinutes));
  const sliderProgress = ((minutes - minMinutes) / (maxMinutes - minMinutes)) * 100;

  return (
    <div className="flex w-full max-w-[224px] items-center gap-2.5 md:justify-self-end">
      <div className="contents">
        <button
          type="button"
          onClick={() => updateMinutes(minutes - 1)}
          disabled={!canDecrease}
          aria-label={`${ariaLabel}减少 1 分钟`}
          className="qp-button-secondary order-1 inline-flex h-6 w-6 items-center justify-center rounded-[6px] p-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Minus size={11} />
        </button>

        <input
          type="range"
          min={minMinutes}
          max={maxMinutes}
          step={1}
          value={minutes}
          onChange={(event) => updateMinutes(Number(event.target.value))}
          aria-label={ariaLabel}
          style={{
            backgroundImage: `linear-gradient(to right, var(--qp-text-tertiary) 0%, var(--qp-text-tertiary) ${sliderProgress}%, var(--qp-track-muted) ${sliderProgress}%, var(--qp-track-muted) 100%)`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 3px",
          }}
          className="order-2 h-5 min-w-[80px] flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-5.5px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--qp-bg-panel)] [&::-webkit-slider-thumb]:bg-[var(--qp-text-tertiary)] [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--qp-bg-panel)] [&::-moz-range-thumb]:bg-[var(--qp-text-tertiary)]"
        />

        <button
          type="button"
          onClick={() => updateMinutes(minutes + 1)}
          disabled={!canIncrease}
          aria-label={`${ariaLabel}增加 1 分钟`}
          className="qp-button-secondary order-4 inline-flex h-6 w-6 items-center justify-center rounded-[6px] p-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={11} />
        </button>
      </div>
      <p className="order-3 min-w-[48px] text-center text-xs font-medium tabular-nums text-[var(--qp-text-secondary)]">
        {minutes} 分钟
      </p>
    </div>
  );
}

function TrackingMinuteField({
  label,
  hint,
  minutes,
  minMinutes,
  maxMinutes,
  onMinutesChange,
}: MinuteControlProps) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">{label}</label>
      <div className="mt-2 grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,260px)] md:gap-4">
        <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">{hint}</p>
        <MinuteStepperSlider
          ariaLabel={label}
          minutes={minutes}
          minMinutes={minMinutes}
          maxMinutes={maxMinutes}
          onMinutesChange={onMinutesChange}
        />
      </div>
    </div>
  );
}

export default function SettingsTrackingPanel({
  idleTimeoutControl,
  timelineMergeGapControl,
  minSessionControl,
  trackingPaused,
  onTrackingPausedChange,
}: SettingsTrackingPanelProps) {
  return (
    <section className="qp-panel min-h-[240px] p-5 md:p-6">
      <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--qp-border-subtle)]">
        <Clock size={16} className="text-[var(--qp-accent-default)]" />
        <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">追踪</h2>
      </div>

      <div className="mt-5 space-y-5">
        <TrackingMinuteField {...idleTimeoutControl} />
        <TrackingMinuteField {...timelineMergeGapControl} />
        <TrackingMinuteField {...minSessionControl} />

        <div>
          <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">暂停追踪</label>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">
              暂停后不再写入新记录，恢复后继续计时。
            </p>
            <QuietSwitch
              checked={trackingPaused}
              onChange={onTrackingPausedChange}
              ariaLabel="切换暂停追踪"
              tone="warning"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
