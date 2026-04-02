import { motion } from "framer-motion";
import { Zap, Monitor, Clock, Settings2 } from "lucide-react";

type View = "dashboard" | "history" | "settings";

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
}

const NAV_ITEMS = [
  { id: "dashboard" as View, icon: Monitor,  label: "Dashboard" },
  { id: "history"   as View, icon: Clock,    label: "History" },
  { id: "settings"  as View, icon: Settings2, label: "Settings" },
];

export default function Sidebar({ currentView, onNavigate }: Props) {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-20 glass-effect flex flex-col items-center py-8 gap-8"
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      {/* Logo */}
      <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
        <Zap className="text-white fill-white" size={24} />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-4 mt-4">
        {NAV_ITEMS.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={item.label}
            onClick={() => onNavigate(item.id)}
            className={`p-4 rounded-2xl transition-all relative ${
              currentView === item.id
                ? "bg-indigo-50 text-indigo-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <item.icon size={22} />
            {currentView === item.id && (
              <motion.div
                layoutId="nav-pill"
                className="absolute left-[-12px] top-4 w-1 h-6 bg-indigo-600 rounded-full"
              />
            )}
          </motion.button>
        ))}
      </nav>
    </motion.aside>
  );
}
