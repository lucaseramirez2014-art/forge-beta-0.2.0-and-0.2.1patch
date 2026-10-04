"use client";

import { CopilotChat } from "../../components/CopilotChat";
import { ForgeNav } from "../../components/ForgeNav";
import { useForge } from "../../components/ForgeProvider";

export default function CopilotPage() {
  const { activeCampaign, activeQuests, player, data } = useForge();
  const completedLessons = activeQuests.filter((lesson) => lesson.status === "completed").map((lesson) => lesson.title);
  const availableLessons = activeQuests.filter((lesson) => lesson.status === "available" || lesson.status === "active").map((lesson) => lesson.title);
  const answers = data.onboarding.answers;
  const activeGoals = answers ? [answers.goalType, answers.improve, answers.commitment, answers.motivation].filter(Boolean) : [];

  return (
    <main className="min-h-screen pb-14">
      <ForgeNav />
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <CopilotChat forgeContext={{ currentCampaign: activeCampaign.title, currentStage: activeCampaign.stage, completedLessons, availableLessons, xp: player.xp, level: player.level, streak: player.streak, stats: player.stats, activeGoals }} />
      </div>
    </main>
  );
}
