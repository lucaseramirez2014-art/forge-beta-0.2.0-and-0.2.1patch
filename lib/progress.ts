import type { FocusSession, Quest } from "./types";

export function focusMinutesToday(sessions: FocusSession[]) {
  const today = new Date().toDateString();
  return sessions.filter((session) => new Date(session.completedAt).toDateString() === today).reduce((total, session) => total + session.minutes, 0);
}

export function currentStreak(sessions: FocusSession[]) {
  const days = new Set(sessions.map((session) => new Date(session.completedAt).toDateString()));
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function campaignCounts(quests: Quest[]) {
  const visible = quests.filter((quest) => quest.status !== "archived");
  return { completed: visible.filter((quest) => quest.status === "completed").length, total: visible.length };
}
