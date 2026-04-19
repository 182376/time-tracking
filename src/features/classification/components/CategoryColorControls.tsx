import { Trash2 } from "lucide-react";
import type { AppCategory } from "../config/categoryTokens";
import QuietColorField from "../../../shared/components/QuietColorField";
import QuietIconAction from "../../../shared/components/QuietIconAction";
import QuietResetAction from "../../../shared/components/QuietResetAction";
import type { ColorDisplayFormat } from "../../../shared/lib/colorFormatting";
import { AppClassification } from "../../../shared/classification/appClassification.ts";

interface Props {
  categories: AppCategory[];
  colorFormat: ColorDisplayFormat;
  getCategoryColor: (category: AppCategory) => string;
  onColorFormatChange: (nextFormat: ColorDisplayFormat) => void;
  onApplyColor: (category: AppCategory, color: string | null) => void;
  onDeleteCategory: (category: AppCategory) => void;
}

export default function CategoryColorControls({
  categories,
  colorFormat,
  getCategoryColor,
  onColorFormatChange,
  onApplyColor,
  onDeleteCategory,
}: Props) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {categories.map((category) => {
        const label = AppClassification.getCategoryLabel(category);
        const color = getCategoryColor(category);

        return (
          <div
            key={category}
            className="rounded-[10px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--qp-bg-panel)]"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-sm font-semibold text-[var(--qp-text-primary)]">{label}</span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <QuietColorField
                  color={color}
                  format={colorFormat}
                  onChange={(nextColor) => onApplyColor(category, nextColor)}
                  onFormatChange={onColorFormatChange}
                  title="颜色"
                />

                <QuietResetAction
                  onClick={() => onApplyColor(category, null)}
                  title="恢复默认颜色"
                >
                  默认
                </QuietResetAction>

                <QuietIconAction
                  icon={<Trash2 size={12} />}
                  tone="danger"
                  onClick={() => onDeleteCategory(category)}
                  title={`删除分类：${label}`}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
