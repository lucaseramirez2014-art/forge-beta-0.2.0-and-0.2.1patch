type StatCardProps = {
  label: string;
  value: string | number;
  detail: string;
  icon: string;
  accent?: boolean;
};

export function StatCard({ label, value, detail, icon, accent = false }: StatCardProps) {
  return (
    <article className={`rounded-2xl border p-4 ${accent ? "border-orange-500/25 bg-orange-500/8" : "border-white/8 bg-white/3"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-100">{value}</p>
        </div>
        <span className={`grid size-9 place-items-center rounded-xl text-lg ${accent ? "bg-orange-500/15" : "bg-white/6"}`} aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-stone-500">{detail}</p>
    </article>
  );
}
