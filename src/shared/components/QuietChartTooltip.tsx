import type { ReactNode } from "react";
import { Tooltip } from "recharts";

type TooltipValue = number | string;
type TooltipName = string;

interface TooltipPayloadEntry {
  value?: TooltipValue;
  name?: string | number;
  dataKey?: string | number;
  color?: string;
  payload?: unknown;
}

type TooltipFormatter = (
  value: TooltipValue,
  name: TooltipName,
  item: TooltipPayloadEntry,
  index: number,
  payload: readonly TooltipPayloadEntry[],
) => ReactNode | [ReactNode, ReactNode];

type TooltipLabelFormatter = (label: ReactNode, payload: readonly TooltipPayloadEntry[]) => ReactNode;

interface Props {
  cursor?: unknown;
  formatter?: TooltipFormatter;
  labelFormatter?: TooltipLabelFormatter;
}

function formatTooltipItem(
  formatter: TooltipFormatter | undefined,
  item: TooltipPayloadEntry,
  index: number,
  payload: readonly TooltipPayloadEntry[],
): { value: ReactNode; name: ReactNode } {
  const baseValue = item.value as TooltipValue;
  const baseName = String(item.name ?? item.dataKey ?? "");
  if (!formatter) {
    return { value: String(baseValue ?? ""), name: baseName };
  }
  const formatted = formatter(baseValue, baseName, item, index, payload);
  if (Array.isArray(formatted)) {
    const [nextValue, nextName] = formatted;
    return {
      value: nextValue ?? "",
      name: nextName ?? baseName,
    };
  }
  return { value: formatted ?? "", name: baseName };
}

function resolveTooltipLabel(
  label: ReactNode,
  payload: readonly TooltipPayloadEntry[],
  labelFormatter?: TooltipLabelFormatter,
): ReactNode {
  if (label === undefined || label === null) {
    return null;
  }
  if (!labelFormatter) {
    return String(label);
  }
  return labelFormatter(label, payload);
}

export default function QuietChartTooltip({ cursor, formatter, labelFormatter }: Props) {
  return (
    <Tooltip
      cursor={cursor as never}
      content={(contentProps) => {
        const { active, payload, label } = contentProps as {
          active?: boolean;
          payload?: readonly TooltipPayloadEntry[];
          label?: ReactNode;
        };
        if (!active || !payload || payload.length === 0) {
          return null;
        }

        const resolvedLabel = resolveTooltipLabel(label, payload, labelFormatter);

        return (
          <div className="qp-chart-tooltip">
            {resolvedLabel ? (
              <div className="qp-chart-tooltip-label">{resolvedLabel}</div>
            ) : null}
            <ul className="qp-chart-tooltip-list">
              {payload.map((item, index) => {
                const { name, value } = formatTooltipItem(formatter, item, index, payload);
                return (
                  <li key={`${item.dataKey ?? item.name ?? "item"}-${index}`} className="qp-chart-tooltip-item">
                    <span className="qp-chart-tooltip-key">
                      <span
                        className="qp-chart-tooltip-dot"
                        style={{ backgroundColor: item.color ?? "var(--qp-accent-default)" }}
                      />
                      {name}
                    </span>
                    <span className="qp-chart-tooltip-value">{value}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }}
    />
  );
}
