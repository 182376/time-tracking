import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Pipette } from "lucide-react";
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  rgbToHex,
  type ColorDisplayFormat,
  type HslColor,
  type RgbColor,
} from "../lib/colorFormatting";

interface Props {
  color: string;
  format: ColorDisplayFormat;
  disabled?: boolean;
  title?: string;
  fixedValueSlot?: boolean;
  onChange: (nextColor: string) => void;
  onFormatChange: (nextFormat: ColorDisplayFormat) => void;
}

interface PopoverPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

const FORMAT_LIST: ColorDisplayFormat[] = ["hex", "rgb", "hsl"];
const POPOVER_GAP = 8;
const VIEWPORT_PADDING = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
  if (/^[0-9A-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return "#000000";
}

function toHexDraft(input: string): string {
  const value = input.toUpperCase().replace(/[^#0-9A-F]/g, "");
  const noHash = value.replace(/#/g, "");
  return `#${noHash.slice(0, 6)}`;
}

function isCompleteHex(value: string): boolean {
  return /^#[0-9A-F]{6}$/.test(value);
}

function parseRgbField(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(parsed, 0, 255);
}

function parseHslField(value: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(parsed, 0, max);
}

export default function QuietColorField({
  color,
  format,
  disabled = false,
  title,
  fixedValueSlot = false,
  onChange,
  onFormatChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0, placement: "bottom" });
  const normalizedColor = useMemo(() => normalizeHex(color), [color]);
  const hsl = useMemo(() => hexToHsl(normalizedColor), [normalizedColor]);
  const rgb = useMemo(() => hexToRgb(normalizedColor), [normalizedColor]);
  const [hexDraft, setHexDraft] = useState(normalizedColor);

  useEffect(() => {
    setHexDraft(normalizedColor);
  }, [normalizedColor]);

  const updatePopoverPosition = (measuredHeight?: number, measuredWidth?: number) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = measuredWidth ?? popoverRef.current?.offsetWidth ?? 288;
    const height = measuredHeight ?? popoverRef.current?.offsetHeight ?? 340;

    const left = clamp(
      rect.left,
      VIEWPORT_PADDING,
      window.innerWidth - width - VIEWPORT_PADDING,
    );

    const belowTop = rect.bottom + POPOVER_GAP;
    const aboveTop = rect.top - height - POPOVER_GAP;
    const spaceBelow = window.innerHeight - belowTop - VIEWPORT_PADDING;
    const spaceAbove = rect.top - POPOVER_GAP - VIEWPORT_PADDING;

    const shouldFlip = spaceBelow < height && spaceAbove > spaceBelow;
    const preferredTop = shouldFlip ? aboveTop : belowTop;
    const boundedTop = clamp(
      preferredTop,
      VIEWPORT_PADDING,
      window.innerHeight - height - VIEWPORT_PADDING,
    );

    setPosition({
      top: boundedTop,
      left,
      placement: shouldFlip ? "top" : "bottom",
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePopoverPosition();
    const handleViewport = () => updatePopoverPosition();
    window.addEventListener("resize", handleViewport);
    window.addEventListener("scroll", handleViewport, true);
    return () => {
      window.removeEventListener("resize", handleViewport);
      window.removeEventListener("scroll", handleViewport, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      updatePopoverPosition(
        popoverRef.current?.offsetHeight,
        popoverRef.current?.offsetWidth,
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, format]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const applyHsl = (next: Partial<HslColor>) => {
    const nextHsl: HslColor = {
      h: next.h ?? hsl.h,
      s: next.s ?? hsl.s,
      l: next.l ?? hsl.l,
    };
    onChange(hslToHex(nextHsl));
  };

  const applySvFromPointer = (clientX: number, clientY: number) => {
    const area = svAreaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    const s = Math.round((x / rect.width) * 100);
    const l = Math.round(100 - (y / rect.height) * 100);
    applyHsl({ s, l });
  };

  const handleSvPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    applySvFromPointer(event.clientX, event.clientY);
    const onMove = (moveEvent: PointerEvent) => applySvFromPointer(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onHexDraftChange = (value: string) => {
    const next = toHexDraft(value);
    setHexDraft(next);
    if (isCompleteHex(next)) onChange(next);
  };

  const onHexDraftBlur = () => {
    if (isCompleteHex(hexDraft)) {
      onChange(normalizeHex(hexDraft));
      return;
    }
    setHexDraft(normalizedColor);
  };

  const onRgbInput = (channel: keyof RgbColor, value: string) => {
    const next: RgbColor = { ...rgb, [channel]: parseRgbField(value, rgb[channel]) };
    onChange(rgbToHex(next));
  };

  const onHslInput = (channel: keyof HslColor, value: string) => {
    const max = channel === "h" ? 360 : 100;
    const next: HslColor = { ...hsl, [channel]: parseHslField(value, hsl[channel], max) };
    onChange(hslToHex(next));
  };

  const pickByEyedropper = async () => {
    const EyeDropperCtor = (
      window as Window & {
        EyeDropper?: { new (): { open: () => Promise<{ sRGBHex: string }> } };
      }
    ).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const instance = new EyeDropperCtor();
      const result = await instance.open();
      onChange(normalizeHex(result.sRGBHex));
    } catch {
      // User canceled eyedropper.
    }
  };

  const supportsEyedropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`qp-color-trigger ${fixedValueSlot ? "qp-color-trigger-fixed-slot" : ""}`}
        title={title}
      >
        <span className="qp-color-trigger-swatch" style={{ backgroundColor: normalizedColor }} aria-hidden />
        <span className="qp-color-trigger-value">{normalizedColor}</span>
      </button>

      {open && !disabled && createPortal(
        <div
          ref={popoverRef}
          className={`qp-color-popover ${position.placement === "top" ? "qp-color-popover-top" : "qp-color-popover-bottom"}`}
          role="dialog"
          aria-label="颜色选择器"
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
        >
          <div className="qp-color-popover-head">
            <div className="qp-color-popover-title">颜色</div>
            <button
              type="button"
              className="qp-color-eyedropper"
              onClick={() => void pickByEyedropper()}
              disabled={!supportsEyedropper}
              title={supportsEyedropper ? "取色器" : "当前环境不支持取色器"}
            >
              <Pipette size={14} />
            </button>
          </div>

          <div
            ref={svAreaRef}
            className="qp-color-sv-area"
            onPointerDown={handleSvPointerDown}
            style={{ "--qp-hue": `${hsl.h}` } as CSSProperties}
          >
            <span
              className="qp-color-sv-thumb"
              style={{ left: `${hsl.s}%`, top: `${100 - hsl.l}%` }}
              aria-hidden
            />
          </div>

          <div className="qp-color-format-switch" role="tablist" aria-label="颜色格式">
            {FORMAT_LIST.map((item) => (
              <button
                key={item}
                type="button"
                className={`qp-color-format-segment ${format === item ? "qp-color-format-segment-active" : ""}`}
                onClick={() => onFormatChange(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          {format === "hex" && (
            <div className="qp-color-input-row">
              <span className="qp-color-row-label">HEX</span>
              <input
                value={hexDraft}
                onChange={(event) => onHexDraftChange(event.target.value)}
                onBlur={onHexDraftBlur}
                className="qp-color-text-input"
              />
            </div>
          )}

          {format === "rgb" && (
            <div className="qp-color-triplet-row">
              <span className="qp-color-row-label">RGB</span>
              <div className="qp-color-triplet-fields">
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.r}
                  onChange={(event) => onRgbInput("r", event.target.value)}
                  className="qp-color-number-input"
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.g}
                  onChange={(event) => onRgbInput("g", event.target.value)}
                  className="qp-color-number-input"
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb.b}
                  onChange={(event) => onRgbInput("b", event.target.value)}
                  className="qp-color-number-input"
                />
              </div>
            </div>
          )}

          {format === "hsl" && (
            <div className="qp-color-triplet-row">
              <span className="qp-color-row-label">HSL</span>
              <div className="qp-color-triplet-fields">
                <input
                  type="number"
                  min={0}
                  max={360}
                  value={hsl.h}
                  onChange={(event) => onHslInput("h", event.target.value)}
                  className="qp-color-number-input"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={hsl.s}
                  onChange={(event) => onHslInput("s", event.target.value)}
                  className="qp-color-number-input"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={hsl.l}
                  onChange={(event) => onHslInput("l", event.target.value)}
                  className="qp-color-number-input"
                />
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
