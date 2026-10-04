import Link from "next/link";
import type { Campaign } from "../lib/types";

export function CampaignCard({ campaign, progress, completed, total }: { campaign: Campaign; progress: number; completed?: number; total?: number }) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-linear-to-br from-orange-500/13 via-stone-900 to-stone-950 p-6 shadow-2xl shadow-orange-950/10">
      <div className="absolute -right-12 -top-20 size-56 rounded-full bg-orange-500/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Active campaign</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{campaign.title}</h2>
            <p className="mt-2 text-sm text-stone-400">{campaign.subtitle}</p>
          </div>
          <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1.5 text-xs font-medium text-orange-200">{campaign.level}</span>
        </div>
        <p className="mt-7 max-w-xl text-sm leading-6 text-stone-300">{campaign.description}</p>
        <div className="mt-7">
          <div className="mb-2 flex justify-between text-xs font-medium text-stone-300">
            <span>Campaign progress</span><span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-black/35 p-px"><div className="h-full rounded-full bg-linear-to-r from-orange-600 to-amber-300" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs text-stone-500">{completed ?? campaign.completed} quests cleared · {Math.max(0, (total ?? campaign.total) - (completed ?? campaign.completed))} remaining</p>
        </div>
        <Link href="/campaign" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:border-orange-300/35 hover:bg-orange-500/10">
          View campaign <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
