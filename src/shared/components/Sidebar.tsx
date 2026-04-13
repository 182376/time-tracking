import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { ArrowUpCircle, Zap, Monitor, Clock, Settings2, Sparkles } from "lucide-react";
import type { View } from "../types/app";

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  showUpdateEntry?: boolean;
  onOpenUpdateDialog?: () => void;
}

type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };
const NO_DRAG_STYLE: AppRegionStyle = { WebkitAppRegion: "no-drag" };

const NAV_ITEMS = [
  { id: "dashboard" as View, icon: Monitor, label: "Dashboard" },
  { id: "history" as View, icon: Clock, label: "History" },
  { id: "mapping" as View, icon: Sparkles, label: "Mapping" },
  { id: "settings" as View, icon: Settings2, label: "Settings" },
];

export default function Sidebar({
  currentView,
  onNavigate,
  showUpdateEntry = false,
  onOpenUpdateDialog,
}: Props) {
  return (
    <motion.aside
      initial={{ x: -4, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="qp-canvas w-[88px] md:w-[96px] shrink-0 flex flex-col items-center py-5 md:py-6 gap-5"
      style={NO_DRAG_STYLE}
    >
      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] text-[var(--qp-accent-default)]">
        <Zap size={18} strokeWidth={2.1} />
      </div>

      <nav className="flex flex-col gap-2.5 mt-1 w-full px-2">
        {NAV_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ x: 0.5 }}
            whileTap={{ scale: 0.995 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            title={item.label}
            onClick={() => onNavigate(item.id)}
            aria-label={item.label}
            className={`qp-nav-item h-10 w-full rounded-[10px] transition-colors relative flex items-center justify-center ${
              currentView === item.id
                ? "qp-nav-item-active"
                : "text-[var(--qp-text-tertiary)] hover:text-[var(--qp-text-secondary)]"
            }`}
          >
            <item.icon size={18} strokeWidth={2.15} />
            {currentView === item.id && (
              <motion.div
                layoutId="nav-pill"
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="absolute left-[-1px] top-[9px] w-[2px] h-[22px] rounded-full bg-[var(--qp-accent-default)]"
              />
            )}
          </motion.button>
        ))}
      </nav>

      <div className="mt-auto w-full px-2">
        {showUpdateEntry ? (
          <button
            type="button"
            onClick={onOpenUpdateDialog}
            className="qp-chip h-8 w-full rounded-[8px] border border-[var(--qp-border-subtle)] text-[var(--qp-accent-default)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <ArrowUpCircle size={13} />
            更新
          </button>
        ) : null}
      </div>
    </motion.aside>
  );
}
