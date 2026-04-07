export interface QuietSegmentedFilterOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: QuietSegmentedFilterOption<T>[];
  onChange: (nextValue: T) => void;
  className?: string;
}

export default function QuietSegmentedFilter<T extends string>({
  value,
  options,
  onChange,
  className,
}: Props<T>) {
  return (
    <div className={`qp-segmented-filter ${className ?? ""}`.trim()}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`qp-segmented-filter-item ${selected ? "qp-segmented-filter-item-selected" : ""}`.trim()}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
