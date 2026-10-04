"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { materializeGeneratedCampaign, type GeneratedCampaign } from "../lib/generatedCampaign";
import { achievements as starterAchievements, createDefaultForgeData, starterCampaigns, worlds as starterWorlds } from "../lib/mockUser";
import type { Achievement, Campaign, CampaignWorld, FocusSession, ForgeData, LessonFeedback, OnboardingAnswers, PlayerStats, Quest, RewardResult, StatRewards } from "../lib/types";

const storageKey = "forge-v0-1-1-beta-data";
const legacyKeys = ["forge-v0-1-0-usable-beta", "forge-v0-1-0-alpha-data", "forge-v0-0-4-data", "forge-v0-0-3-data"];
const defaultSnapshot = JSON.stringify(createDefaultForgeData());
const listeners = new Set<() => void>();
let cachedSnapshot = defaultSnapshot;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nextLevel = (level: number) => level * 200 + 200;
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;

function readSnapshot() {
  if (typeof window === "undefined") return defaultSnapshot;
  const stored = window.localStorage.getItem(storageKey) ?? legacyKeys.map((key) => window.localStorage.getItem(key)).find(Boolean) ?? defaultSnapshot;
  if (stored !== cachedSnapshot) cachedSnapshot = stored;
  return cachedSnapshot;
}
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function notify() { listeners.forEach((listener) => listener()); }
function streak(sessions: FocusSession[]) {
  const days = new Set(sessions.filter((session) => session.actualSeconds > 0).map((session) => new Date(session.finishedAt).toDateString()));
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let value = 0;
  while (days.has(cursor.toDateString())) { value += 1; cursor.setDate(cursor.getDate() - 1); }
  return value;
}
function progressFor(quests: Quest[]) {
  const visible = quests.filter((quest) => quest.status !== "archived");
  const completed = visible.filter((quest) => quest.status === "completed").length;
  return { completed, total: visible.length, progress: visible.length ? Math.round((completed / visible.length) * 100) : 0 };
}
function resolveQuests(quests: Quest[], activeQuestId: string | null) {
  return quests.map((quest) => {
    if (["archived", "completed"].includes(quest.status)) return quest;
    if (quest.id === activeQuestId) return { ...quest, status: "active" as const };
    return { ...quest, status: quest.prerequisites.every((id) => quests.find((item) => item.id === id)?.status === "completed") ? "available" as const : "locked" as const };
  });
}
function resolveWorlds(quests: Quest[], worlds: CampaignWorld[]) {
  return worlds.map((world) => {
    const worldQuests = quests.filter((quest) => quest.worldId === world.id);
    const boss = quests.find((quest) => quest.id === world.bossQuestId);
    return { ...world, status: boss?.status === "completed" ? "completed" as const : worldQuests.some((quest) => ["available", "active", "completed"].includes(quest.status)) ? "available" as const : "locked" as const };
  });
}
function campaignsWithProgress(campaigns: Campaign[], quests: Quest[], worlds: CampaignWorld[]) {
  return campaigns.map((campaign) => {
    const progress = progressFor(quests.filter((quest) => quest.campaignId === campaign.id));
    const campaignWorlds = worlds.filter((world) => world.campaignId === campaign.id).sort((a, b) => a.order - b.order);
    const current = campaignWorlds.find((world) => world.status === "available") ?? campaignWorlds.at(-1);
    return { ...campaign, ...progress, level: current?.title ?? campaign.level, stage: current?.title ?? campaign.stage };
  });
}
function elapsed(session: ForgeData["activeFocusSession"]) { return !session ? 0 : Math.max(0, Math.round(session.elapsedSeconds + (session.isRunning && session.startedAt ? (Date.now() - session.startedAt) / 1000 : 0))); }
function achievementsFor(achievements: Achievement[], quests: Quest[], sessions: FocusSession[], xp: number) {
  const completed = quests.filter((quest) => quest.status === "completed");
  const rules: Record<Achievement["id"], boolean> = { "first-quest": completed.length > 0, "first-focus": sessions.some((session) => session.actualSeconds > 0), "hundred-xp": xp >= 100, "first-boss": completed.some((quest) => quest.difficulty === "Boss"), "three-quests": completed.length >= 3 };
  const newly: Achievement["id"][] = [];
  const now = new Date().toISOString();
  return { achievements: achievements.map((achievement) => !achievement.unlockedAt && rules[achievement.id] ? (newly.push(achievement.id), { ...achievement, unlockedAt: now }) : achievement), newly };
}
function validCampaign(value: unknown): value is Campaign { return Boolean(value) && typeof value === "object" && typeof (value as Campaign).id === "string" && typeof (value as Campaign).title === "string"; }
function validWorld(value: unknown): value is CampaignWorld { return Boolean(value) && typeof value === "object" && typeof (value as CampaignWorld).id === "string" && typeof (value as CampaignWorld).campaignId === "string" && typeof (value as CampaignWorld).bossQuestId === "string"; }
function validQuest(value: unknown): value is Quest { return Boolean(value) && typeof value === "object" && typeof (value as Quest).id === "string" && typeof (value as Quest).campaignId === "string" && typeof (value as Quest).worldId === "string" && typeof (value as Quest).title === "string"; }

function customCampaignData(candidate: Partial<ForgeData>) {
  const starterIds = new Set(starterCampaigns.map((campaign) => campaign.id));
  const campaigns = (Array.isArray(candidate.campaigns) ? candidate.campaigns : []).filter(validCampaign).filter((campaign) => !starterIds.has(campaign.id)).map((campaign) => ({ ...campaign, primaryStats: Array.isArray(campaign.primaryStats) ? campaign.primaryStats : ["Learning", "Discipline", "Creativity"] as Campaign["primaryStats"], generated: Boolean(campaign.generated), estimatedWeeks: finite(campaign.estimatedWeeks) || undefined, sourceGoal: typeof campaign.sourceGoal === "string" ? campaign.sourceGoal : undefined }));
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const worlds = (Array.isArray(candidate.worlds) ? candidate.worlds : []).filter(validWorld).filter((world) => campaignIds.has(world.campaignId)).map((world) => ({ ...world, order: Math.max(1, Math.round(finite(world.order, 1))) }));
  const worldIds = new Set(worlds.map((world) => world.id));
  const quests = (Array.isArray(candidate.quests) ? candidate.quests : []).filter(validQuest).filter((quest) => campaignIds.has(quest.campaignId) && worldIds.has(quest.worldId)).map((quest) => ({ ...quest, prerequisites: Array.isArray(quest.prerequisites) ? quest.prerequisites.filter((id): id is string => typeof id === "string") : [], focusSeconds: finite(quest.focusSeconds), xpEarned: finite(quest.xpEarned), statEarned: quest.statEarned && typeof quest.statEarned === "object" ? quest.statEarned : {}, feedback: ["too-easy", "good", "too-hard"].includes(quest.feedback ?? "") ? quest.feedback : undefined }));
  const usable = new Set(campaigns.filter((campaign) => worlds.some((world) => world.campaignId === campaign.id) && quests.some((quest) => quest.campaignId === campaign.id)).map((campaign) => campaign.id));
  return { campaigns: campaigns.filter((campaign) => usable.has(campaign.id)), worlds: worlds.filter((world) => usable.has(world.campaignId)), quests: quests.filter((quest) => usable.has(quest.campaignId)) };
}

function migrate(raw: unknown): ForgeData | null {
  try {
    const candidate = raw as Partial<ForgeData>;
    if (!candidate?.player || !Array.isArray(candidate.quests) || !Array.isArray(candidate.sessions)) return null;
    const fallback = createDefaultForgeData();
    const saved = candidate.quests as Partial<Quest>[];
    const starterQuests = fallback.quests.map((starter) => {
      const previous = saved.find((quest) => quest.id === starter.id || (starter.id === "python-variables" && quest.id === "variables"));
      const complete = previous?.status === "completed";
      return { ...starter, ...previous, id: starter.id, campaignId: starter.campaignId, worldId: starter.worldId, prerequisites: starter.prerequisites, statRewards: starter.statRewards, focusSeconds: finite(previous?.focusSeconds, complete ? starter.estimatedMinutes * 60 : 0), xpEarned: finite(previous?.xpEarned, complete ? starter.xpReward : 0), statEarned: previous?.statEarned ?? (complete ? starter.statRewards : {}), feedback: ["too-easy", "good", "too-hard"].includes(previous?.feedback ?? "") ? previous?.feedback : undefined } as Quest;
    });
    const custom = customCampaignData(candidate);
    const baseCampaigns = [...starterCampaigns, ...custom.campaigns];
    const baseWorlds = [...starterWorlds, ...custom.worlds];
    const quests = [...starterQuests, ...custom.quests];
    const available = resolveQuests(quests, null);
    const requestedActiveId = typeof candidate.activeQuestId === "string" ? candidate.activeQuestId : candidate.activeFocusSession?.questId;
    const activeQuestId = requestedActiveId && available.find((quest) => quest.id === requestedActiveId)?.status === "available" ? requestedActiveId : null;
    const resolved = resolveQuests(quests, activeQuestId);
    const worlds = resolveWorlds(resolved, baseWorlds);
    const campaigns = campaignsWithProgress(baseCampaigns, resolved, worlds);
    const savedSession = candidate.activeFocusSession;
    const activeFocusSession = activeQuestId && savedSession?.questId === activeQuestId && typeof savedSession.id === "string" ? { ...savedSession, elapsedSeconds: finite(savedSession.elapsedSeconds), startedAt: typeof savedSession.startedAt === "number" ? savedSession.startedAt : null, createdAt: typeof savedSession.createdAt === "string" ? savedSession.createdAt : new Date().toISOString(), isRunning: Boolean(savedSession.isRunning) } : null;
    const sessions = (candidate.sessions as Partial<FocusSession>[]).map((item) => ({ id: item.id ?? uid("session"), questId: item.questId ?? "unknown", questTitle: item.questTitle ?? "Imported session", campaignId: item.campaignId ?? "python-developer", campaignTitle: item.campaignTitle ?? "Python Developer", minutes: item.minutes ?? 1, targetMinutes: item.targetMinutes ?? item.minutes ?? 1, actualSeconds: item.actualSeconds ?? Math.max(1, (item.minutes ?? 1) * 60), xpAwarded: item.xpAwarded ?? 0, completionRatio: item.completionRatio ?? 0, result: item.result ?? (item.completionRatio === 1 ? "completed" : "ended-early"), startedAt: item.startedAt ?? item.completedAt ?? new Date().toISOString(), finishedAt: item.finishedAt ?? item.completedAt ?? new Date().toISOString(), completedAt: item.completedAt ?? item.finishedAt ?? new Date().toISOString() }));
    const player = { ...fallback.player, ...candidate.player, stats: { ...fallback.player.stats, ...candidate.player.stats }, streak: streak(sessions) };
    const activeCampaignId = typeof candidate.activeCampaignId === "string" && campaigns.some((campaign) => campaign.id === candidate.activeCampaignId) ? candidate.activeCampaignId : "python-developer";
    const savedAchievements = Array.isArray(candidate.achievements) ? candidate.achievements : [];
    return { ...fallback, version: 7, onboarding: { completed: Boolean(candidate.onboarding?.completed), answers: candidate.onboarding?.answers ?? null }, player, campaigns, worlds, quests: resolved, sessions, achievements: starterAchievements.map((achievement) => ({ ...achievement, ...(savedAchievements.find((savedAchievement) => savedAchievement.id === achievement.id) ?? {}) })), activeCampaignId, activeQuestId, activeFocusSession, lastReward: null };
  } catch { return null; }
}
function parse(snapshot: string) { try { return migrate(JSON.parse(snapshot)); } catch { return null; } }

type ForgeState = {
  data: ForgeData; player: ForgeData["player"]; activeCampaign: Campaign; activeQuests: Quest[]; activeQuest: Quest | null; sessions: FocusSession[];
  selectQuest: (questId: string) => boolean; startFocus: (sessionId: string) => void; pauseFocus: (sessionId: string) => void; finishFocusSession: (sessionId: string) => RewardResult | null; clearActiveSession: () => void;
  completeOnboarding: (answers: OnboardingAnswers) => void; createGeneratedCampaign: (campaign: GeneratedCampaign, answers: OnboardingAnswers) => boolean; setLessonFeedback: (questId: string, feedback: LessonFeedback) => void; restartOnboarding: () => void; setActiveCampaign: (campaignId: string) => void; resetProgress: () => void; exportData: () => string; importData: (serialized: string) => boolean;
};
const ForgeContext = createContext<ForgeState | null>(null);

export function ForgeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => defaultSnapshot);
  const data = useMemo(() => parse(snapshot) ?? createDefaultForgeData(), [snapshot]);
  const commit = useCallback((next: ForgeData) => { const serialized = JSON.stringify(next); if (serialized === cachedSnapshot) return; cachedSnapshot = serialized; window.localStorage.setItem(storageKey, serialized); notify(); }, []);
  const activeCampaign = data.campaigns.find((campaign) => campaign.id === data.activeCampaignId) ?? data.campaigns[0];
  const activeQuests = data.quests.filter((quest) => quest.campaignId === activeCampaign.id && quest.status !== "archived");
  const activeQuest = data.quests.find((quest) => quest.id === data.activeQuestId) ?? null;
  const value = useMemo<ForgeState>(() => ({
    data, player: data.player, activeCampaign, activeQuests, activeQuest, sessions: data.sessions,
    selectQuest: (questId) => {
      const quest = data.quests.find((item) => item.id === questId);
      if (!quest || ["locked", "completed", "archived"].includes(quest.status) || (data.activeFocusSession && data.activeFocusSession.questId !== questId)) return false;
      if (data.activeQuestId === questId && data.activeFocusSession?.questId === questId) return true;
      const session = data.activeFocusSession ?? { id: uid("active"), questId, elapsedSeconds: 0, startedAt: null, createdAt: new Date().toISOString(), isRunning: false };
      commit({ ...data, activeQuestId: questId, activeFocusSession: session, quests: resolveQuests(data.quests, questId), lastReward: null });
      return true;
    },
    startFocus: (sessionId) => { const session = data.activeFocusSession; if (!session || session.id !== sessionId || session.isRunning) return; commit({ ...data, activeFocusSession: { ...session, elapsedSeconds: elapsed(session), startedAt: Date.now(), isRunning: true } }); },
    pauseFocus: (sessionId) => { const session = data.activeFocusSession; if (!session || session.id !== sessionId || !session.isRunning) return; commit({ ...data, activeFocusSession: { ...session, elapsedSeconds: elapsed(session), startedAt: null, isRunning: false } }); },
    finishFocusSession: (sessionId) => {
      const active = data.activeFocusSession;
      if (!active || active.id !== sessionId) return null;
      const quest = data.quests.find((item) => item.id === active.questId);
      if (!quest) return null;
      const seconds = Math.min(quest.estimatedMinutes * 60, elapsed(active));
      if (seconds <= 0) return null;
      const total = quest.estimatedMinutes * 60; const progressSeconds = Math.min(total, quest.focusSeconds + seconds); const ratio = progressSeconds / total; const newXP = Math.round(quest.xpReward * ratio); const xpGained = Math.max(0, newXP - quest.xpEarned);
      const statsDelta = Object.fromEntries(Object.entries(quest.statRewards).map(([key, stat]) => [key, Math.max(0, Math.round((stat ?? 0) * ratio) - (quest.statEarned[key as keyof StatRewards] ?? 0))]).filter(([, stat]) => Number(stat) > 0)) as StatRewards;
      const questCompleted = progressSeconds >= total;
      const quests = resolveQuests(data.quests.map((item) => item.id === quest.id ? { ...item, focusSeconds: progressSeconds, xpEarned: newXP, statEarned: Object.fromEntries(Object.entries(item.statRewards).map(([key, stat]) => [key, Math.round((stat ?? 0) * ratio)])), status: questCompleted ? "completed" as const : "available" as const, completionMeta: { ...item.completionMeta, completedAt: questCompleted ? new Date().toISOString() : item.completionMeta?.completedAt, actualSeconds: progressSeconds, endedEarly: !questCompleted } } : item), null);
      const worlds = resolveWorlds(quests, data.worlds); const campaigns = campaignsWithProgress(data.campaigns, quests, worlds);
      let level = data.player.level; let threshold = data.player.xpToNextLevel; const nextXP = data.player.xp + xpGained; while (nextXP >= threshold) { level += 1; threshold = nextLevel(level); }
      const nextStats = { ...data.player.stats } as PlayerStats; Object.entries(statsDelta).forEach(([key, stat]) => { nextStats[key as keyof PlayerStats] += stat ?? 0; });
      const now = new Date().toISOString(); const campaign = data.campaigns.find((item) => item.id === quest.campaignId) ?? activeCampaign;
      const record: FocusSession = { id: active.id, questId: quest.id, questTitle: quest.title, campaignId: quest.campaignId, campaignTitle: campaign.title, minutes: Math.max(1, Math.round(seconds / 60)), targetMinutes: quest.estimatedMinutes, actualSeconds: seconds, xpAwarded: xpGained, completionRatio: ratio, result: questCompleted ? "completed" : "ended-early", startedAt: active.createdAt, finishedAt: now, completedAt: now };
      const sessions = [record, ...data.sessions].slice(0, 100); const achievement = achievementsFor(data.achievements, quests, sessions, nextXP);
      const unlockedQuestIds = quests.filter((item) => item.status === "available" && data.quests.find((prior) => prior.id === item.id)?.status === "locked").map((item) => item.id);
      const unlockedWorldIds = worlds.filter((world) => world.status === "available" && data.worlds.find((prior) => prior.id === world.id)?.status === "locked").map((world) => world.id);
      const result: RewardResult = { sessionId, questId: quest.id, questTitle: quest.title, xpGained, focusMinutes: record.minutes, completionRatio: ratio, questCompleted, levelBefore: data.player.level, levelAfter: level, unlockedQuestIds, unlockedWorldIds, newAchievementIds: achievement.newly, statsDelta, campaignProgress: campaigns.find((item) => item.id === quest.campaignId)?.progress ?? 0, streak: streak(sessions) };
      commit({ ...data, player: { ...data.player, xp: nextXP, level, xpToNextLevel: threshold, streak: result.streak, totalFocusMinutes: data.player.totalFocusMinutes + record.minutes, stats: nextStats }, campaigns, worlds, quests, sessions, achievements: achievement.achievements, activeQuestId: null, activeFocusSession: null, lastReward: result });
      return result;
    },
    clearActiveSession: () => {
      const active = data.activeFocusSession; if (!active) return; const quest = data.quests.find((item) => item.id === active.questId); const seconds = elapsed(active); const now = new Date().toISOString();
      const record: FocusSession = { id: active.id, questId: active.questId, questTitle: quest?.title ?? "Unknown quest", campaignId: quest?.campaignId ?? data.activeCampaignId, campaignTitle: data.campaigns.find((item) => item.id === quest?.campaignId)?.title ?? "Unknown campaign", minutes: Math.max(0, Math.round(seconds / 60)), targetMinutes: quest?.estimatedMinutes ?? 0, actualSeconds: seconds, xpAwarded: 0, completionRatio: 0, result: "abandoned", startedAt: active.createdAt, finishedAt: now, completedAt: now };
      commit({ ...data, activeQuestId: null, activeFocusSession: null, quests: resolveQuests(data.quests, null), sessions: seconds ? [record, ...data.sessions].slice(0, 100) : data.sessions });
    },
    completeOnboarding: (answers) => commit({ ...data, onboarding: { completed: true, answers } }),
    createGeneratedCampaign: (campaign, answers) => {
      const forged = materializeGeneratedCampaign(campaign);
      if (data.campaigns.some((item) => item.id === forged.campaign.id)) return false;
      const quests = resolveQuests([...data.quests, ...forged.quests], null); const worlds = resolveWorlds(quests, [...data.worlds, ...forged.worlds]); const campaigns = campaignsWithProgress([...data.campaigns, forged.campaign], quests, worlds);
      commit({ ...data, version: 7, onboarding: { completed: true, answers }, campaigns, worlds, quests, activeCampaignId: forged.campaign.id, activeQuestId: null, activeFocusSession: null, lastReward: null });
      return true;
    },
    setLessonFeedback: (questId, feedback) => { const quest = data.quests.find((item) => item.id === questId); if (!quest || quest.status !== "completed" || quest.feedback === feedback) return; commit({ ...data, quests: data.quests.map((item) => item.id === questId ? { ...item, feedback } : item) }); },
    restartOnboarding: () => commit({ ...data, onboarding: { completed: false, answers: null } }),
    setActiveCampaign: (campaignId) => { if (!data.campaigns.some((item) => item.id === campaignId)) return; commit({ ...data, activeCampaignId: campaignId, activeQuestId: null, activeFocusSession: null, quests: resolveQuests(data.quests, null) }); },
    resetProgress: () => commit(createDefaultForgeData()),
    exportData: () => JSON.stringify(data, null, 2),
    importData: (serialized) => { const imported = parse(serialized); if (!imported) return false; commit(imported); return true; },
  }), [activeCampaign, activeQuest, activeQuests, commit, data]);
  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}
export function useForge() { const context = useContext(ForgeContext); if (!context) throw new Error("useForge must be used inside ForgeProvider"); return context; }
export const campaignProgress = (quests: Quest[]) => progressFor(quests).progress;
