import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

export interface QuietSelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface QuietSelectProps<T extends string | number> {
  value: T;
  options: Array<QuietSelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export default function QuietSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: QuietSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1);
      return;
    }
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      listRef.current?.focus();
    });
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
      return;
    }
    if (event.key === "Escape") {
      closeMenu();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const enabledIndexes = options
      .map((option, index) => ({ option, index }))
      .filter((item) => !item.option.disabled)
      .map((item) => item.index);
    if (enabledIndexes.length === 0) {
      return;
    }
    const currentPos = enabledIndexes.indexOf(highlightedIndex);
    if (event.key === "ArrowDown") {
      const nextPos = currentPos < 0 ? 0 : (currentPos + 1) % enabledIndexes.length;
      setHighlightedIndex(enabledIndexes[nextPos]);
      return;
    }
    if (event.key === "ArrowUp") {
      const nextPos = currentPos < 0 ? enabledIndexes.length - 1 : (currentPos - 1 + enabledIndexes.length) % enabledIndexes.length;
      setHighlightedIndex(enabledIndexes[nextPos]);
      return;
    }
    const nextIndex = highlightedIndex >= 0 ? highlightedIndex : enabledIndexes[0];
    const target = options[nextIndex];
    if (target && !target.disabled) {
      onChange(target.value);
      closeMenu(true);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`qp-select-root ${className ?? ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeMenu();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={`${listboxId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className="qp-control qp-select-trigger"
      >
        <span className="truncate">{selectedOption?.label ?? ""}</span>
        <ChevronDown size={14} className={`qp-select-caret ${open ? "qp-select-caret-open" : ""}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${listboxId}-trigger`}
          aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
          onKeyDown={handleListKeyDown}
          className="qp-select-menu"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === highlightedIndex;
            return (
              <li
                key={String(option.value)}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selected}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={option.disabled}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    closeMenu(true);
                  }}
                  className={`qp-select-option ${selected ? "qp-select-option-selected" : ""} ${highlighted ? "qp-select-option-highlighted" : ""}`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
