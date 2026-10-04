import { NextResponse } from "next/server";
import type { GeneratedCampaign, GeneratedLesson, GeneratedStage } from "../../../../lib/generatedCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerationRequest = {
  goal?: unknown;
  currentLevel?: unknown;
  desiredOutcome?: unknown;
  weeklyTime?: unknown;
  learningStyle?: unknown;
  deadline?: unknown;
  adjustment?: unknown;
  previousCampaign?: unknown;
};

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const text = (value: unknown, limit = 500) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";

const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function cleanJson(value: string) {
  return value.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
}

function generatedLesson(value: unknown, type: "lesson" | "boss", knownIds: Set<string>, stageLessonIds: Set<string>): GeneratedLesson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lesson = value as Record<string, unknown>;
  const id = text(lesson.id, 64);
  const title = text(lesson.title, 120);
  const description = text(lesson.description, 360);
  const difficulty = text(lesson.difficulty, 20).toLowerCase();
  const estimatedMinutes = number(lesson.estimatedMinutes);
  const xpReward = number(lesson.xpReward);
  const prerequisites = Array.isArray(lesson.prerequisites)
    ? lesson.prerequisites.map((item) => text(item, 64)).filter(Boolean)
    : [];

  if (
    !id ||
    knownIds.has(id) ||
    !title ||
    !description ||
    lesson.type !== type ||
    (type === "boss" ? difficulty !== "boss" : !["easy", "standard", "hard"].includes(difficulty)) ||
    estimatedMinutes === null ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedMinutes < 10 ||
    estimatedMinutes > 120 ||
    xpReward === null ||
    !Number.isInteger(xpReward) ||
    xpReward < 20 ||
    xpReward > 500 ||
    prerequisites.some((prerequisite) => !stageLessonIds.has(prerequisite)) ||
    (type === "boss" && prerequisites.length > 0)
  ) {
    return null;
  }

  knownIds.add(id);
  return {
    id,
    title,
    description,
    difficulty: difficulty as GeneratedLesson["difficulty"],
    estimatedMinutes,
    xpReward,
    type,
    prerequisites: type === "boss" ? [] : prerequisites,
  };
}

function validateCampaign(value: unknown): GeneratedCampaign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const campaign = value as Record<string, unknown>;
  const title = text(campaign.title, 100);
  const description = text(campaign.description, 420);
  const estimatedWeeks = number(campaign.estimatedWeeks);
  const rawStages = campaign.stages;
  if (!title || !description || estimatedWeeks === null || !Number.isInteger(estimatedWeeks) || estimatedWeeks < 1 || estimatedWeeks > 52 || !Array.isArray(rawStages) || rawStages.length < 1 || rawStages.length > 6) return null;

  const knownIds = new Set<string>();
  const stageIds = new Set<string>();
  const stages: GeneratedStage[] = [];
  for (const rawStage of rawStages) {
    if (!rawStage || typeof rawStage !== "object" || Array.isArray(rawStage)) return null;
    const stage = rawStage as Record<string, unknown>;
    const id = text(stage.id, 64);
    const stageTitle = text(stage.title, 120);
    const stageDescription = text(stage.description, 360);
    const rawLessons = stage.lessons;
    if (!id || stageIds.has(id) || !stageTitle || !stageDescription || !Array.isArray(rawLessons) || rawLessons.length < 1 || rawLessons.length > 5) return null;
    stageIds.add(id);

    const stageLessonIds = new Set<string>();
    for (const rawLesson of rawLessons) {
      const lessonId = rawLesson && typeof rawLesson === "object" ? text((rawLesson as Record<string, unknown>).id, 64) : "";
      if (!lessonId || stageLessonIds.has(lessonId) || knownIds.has(lessonId)) return null;
      stageLessonIds.add(lessonId);
    }
    const lessons: GeneratedLesson[] = [];
    const previousLessonIds = new Set<string>();
    for (const rawLesson of rawLessons) {
      const lesson = generatedLesson(rawLesson, "lesson", knownIds, previousLessonIds);
      if (!lesson) return null;
      lessons.push(lesson);
      previousLessonIds.add(lesson.id);
    }
    const bossProject = generatedLesson(stage.bossProject, "boss", knownIds, stageLessonIds);
    if (!bossProject) return null;
    stages.push({ id, title: stageTitle, description: stageDescription, lessons, bossProject });
  }
  return { title, description, estimatedWeeks, stages };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json({ error: "Campaign forging is not configured on this deployment yet." }, 503);

  let input: GenerationRequest;
  try {
    input = (await request.json()) as GenerationRequest;
  } catch {
    return json({ error: "Please send a valid campaign brief." }, 400);
  }

  const goal = text(input.goal, 160);
  const currentLevel = text(input.currentLevel, 60);
  const desiredOutcome = text(input.desiredOutcome, 420);
  const weeklyTime = text(input.weeklyTime, 80);
  const learningStyle = text(input.learningStyle, 60);
  const deadline = text(input.deadline, 80);
  const adjustment = text(input.adjustment, 280);
  if (!goal || !currentLevel || !desiredOutcome || !weeklyTime || !learningStyle) {
    return json({ error: "Add your goal and personalization details before forging a campaign." }, 400);
  }

  const previousCampaign = validateCampaign(input.previousCampaign);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openrouter/free",
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content:
              "You design structured learning campaigns for FORGE. Return ONLY one valid JSON object, without markdown. Create 2 to 4 stages. Each stage must contain 2 to 4 lessons and one bossProject. Lesson and boss IDs must be unique simple kebab-case strings. Regular lesson difficulty is exactly easy, standard, or hard; bossProject difficulty is exactly boss. Every lesson must have estimatedMinutes (integer 10-120), xpReward (integer 20-500), type, and prerequisites. A lesson's prerequisites may only reference lessons in its own stage, and must not create a cycle. Make the first lesson in each stage have an empty prerequisites array. Never award progress or imply this plan has been completed. JSON shape: {\"title\":string,\"description\":string,\"estimatedWeeks\":integer,\"stages\":[{\"id\":string,\"title\":string,\"description\":string,\"lessons\":[{\"id\":string,\"title\":string,\"description\":string,\"difficulty\":\"easy\"|\"standard\"|\"hard\",\"estimatedMinutes\":integer,\"xpReward\":integer,\"type\":\"lesson\",\"prerequisites\":[string]}],\"bossProject\":{\"id\":string,\"title\":string,\"description\":string,\"difficulty\":\"boss\",\"estimatedMinutes\":integer,\"xpReward\":integer,\"type\":\"boss\",\"prerequisites\":[]}}]}",
          },
          {
            role: "user",
            content: JSON.stringify({
              goal,
              currentLevel,
              desiredOutcome,
              weeklyTime,
              learningStyle,
              deadline: deadline || null,
              adjustment: adjustment || null,
              previousCampaign: previousCampaign ?? null,
            }),
          },
        ],
      }),
    });
    if (process.env.NODE_ENV !== "production") console.info("[FORGE Campaign Generator] OpenRouter status", response.status);
    if (!response.ok) {
      if (response.status === 429) return json({ error: "Campaign forging is busy right now. Please try again shortly." }, 429);
      return json({ error: "Campaign forging is temporarily unavailable. Please try again." }, 502);
    }
    const providerBody = await response.text();
    let providerPayload: { choices?: Array<{ message?: { content?: unknown } }> } | null = null;
    try {
      providerPayload = JSON.parse(providerBody) as { choices?: Array<{ message?: { content?: unknown } }> };
    } catch {
      return json({ error: "FORGE could not read that campaign plan. Please try again." }, 502);
    }
    const content = providerPayload?.choices?.[0]?.message?.content;
    let candidate: unknown = null;
    if (typeof content === "string" && content.trim()) {
      try {
        candidate = JSON.parse(cleanJson(content));
      } catch {
        candidate = null;
      }
    }
    const campaign = validateCampaign(candidate);
    if (process.env.NODE_ENV !== "production") console.info("[FORGE Campaign Generator] choices", Boolean(providerPayload?.choices?.length), "campaign valid", Boolean(campaign));
    if (!campaign) return json({ error: "FORGE could not forge a valid campaign plan. Please try again." }, 502);
    return json({ campaign });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return json({ error: "Campaign forging took too long. Please try again." }, 504);
    return json({ error: "Campaign forging could not be reached. Please try again." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
