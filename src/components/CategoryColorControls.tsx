import { Trash2 } from "lucide-react";
import type { AppCategory } from "../lib/config/categoryTokens";
import { ProcessMapper } from "../lib/ProcessMapper";

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
        const label = ProcessMapper.getCategoryLabel(category);
        const color = ProcessMapper.getCategoryColor(category);
        const isBusy = busyCategory === category;

        return (
          <div
            key={category}
            className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-sm font-semibold text-slate-700">{label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {color}
                </span>

                <input
                  type="color"
                  value={color}
                  disabled={isBusy}
                  onChange={(event) => void onApplyColor(category, event.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed"
                  title={`${label} 颜色`}
                />

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onApplyColor(category, null)}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  title="恢复默认颜色"
                >
                  默认
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onDeleteCategory(category)}
                  className="rounded-md p-1 text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
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
