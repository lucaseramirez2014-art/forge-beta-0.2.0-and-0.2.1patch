type XPBarProps = {
  current: number;
  goal: number;
  compact?: boolean;
};

export function XPBar({ current, goal, compact = false }: XPBarProps) {
  const percentage = Math.min(100, Math.round((current / goal) * 100));

  return (
    <div className={compact ? "w-full" : "w-full max-w-md"}>
      <div className="mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-stone-400">
        <span>{current.toLocaleString()} XP</span>
        <span>{goal.toLocaleString()} XP</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8 p-px shadow-inner shadow-black/40">
        <div
          className="h-full rounded-full bg-linear-to-r from-orange-600 via-orange-400 to-amber-200 transition-all duration-700"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
