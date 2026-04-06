import { Trash2 } from "lucide-react";
import type { AppCategory } from "../../../lib/config/categoryTokens";
import { AppClassificationFacade } from "../../../shared/lib/appClassificationFacade";

interface Props {
  categories: AppCategory[];
  busyCategory: string | null;
  onApplyColor: (category: AppCategory, color: string | null) => Promise<void>;
  onDeleteCategory: (category: AppCategory) => Promise<void>;
}

export default function CategoryColorControls({
  categories,
  busyCategory,
  onApplyColor,
  onDeleteCategory,
}: Props) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const label = AppClassificationFacade.getCategoryLabel(category);
        const color = AppClassificationFacade.getCategoryColor(category);
        const isBusy = busyCategory === category;

        return (
          <div
            key={category}
            className="rounded-[10px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-[var(--qp-bg-panel)]"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-sm font-semibold text-[var(--qp-text-secondary)]">{label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="rounded-[6px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--qp-text-secondary)]">
                  {color}
                </span>

                <input
                  type="color"
                  value={color}
                  disabled={isBusy}
                  onChange={(event) => void onApplyColor(category, event.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-[6px] border border-[var(--qp-border-subtle)] bg-transparent p-0.5 disabled:cursor-not-allowed"
                  title={`${label} 颜色`}
                />

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onApplyColor(category, null)}
                  className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium text-[var(--qp-text-tertiary)] transition hover:text-[var(--qp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  title="恢复默认颜色"
                >
                  默认
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onDeleteCategory(category)}
                  className="rounded-[6px] p-1 text-[var(--qp-danger)] transition hover:bg-[color:var(--qp-danger)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title={`删除分类：${label}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


