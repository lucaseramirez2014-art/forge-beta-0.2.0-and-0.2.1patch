"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export type ForgeProgressContext = {
  currentCampaign: string;
  currentStage: string;
  completedLessons: string[];
  availableLessons: string[];
  xp: number;
  level: number;
  streak: number;
  stats: Record<string, number>;
  activeGoals: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendedLesson?: string | null;
  reason?: string;
};

type CopilotResponse = {
  reply: string;
  recommendedLesson: string | null;
  reason: string;
  error?: string;
};

const threadStorageKey = "forge-copilot-v1-thread";
const progressStorageKey = "forge-copilot-v1-use-progress";
const starterPrompts = [
  "What should I work on today?",
  "Help me plan a 30-minute session.",
  "Explain my current campaign.",
  "Help me break down a goal.",
  "What skill should I focus on next?",
];

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    Boolean(message.content.trim())
  );
}

function messageId(role: ChatMessage["role"]) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CopilotChat({ forgeContext }: { forgeContext: ForgeProgressContext }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [useForgeProgress, setUseForgeProgress] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedThread = window.localStorage.getItem(threadStorageKey);
        if (storedThread) {
          const parsed = JSON.parse(storedThread) as unknown;
          if (Array.isArray(parsed)) setMessages(parsed.filter(isChatMessage).slice(-24));
        }
        const storedToggle = window.localStorage.getItem(progressStorageKey);
        if (storedToggle === "false") setUseForgeProgress(false);
      } catch {
        window.localStorage.removeItem(threadStorageKey);
      } finally {
        setHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(threadStorageKey, JSON.stringify(messages.slice(-24)));
    window.localStorage.setItem(progressStorageKey, String(useForgeProgress));
  }, [hydrated, messages, useForgeProgress]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [loading, messages]);

  function startNewChat() {
    if (loading) return;
    setMessages([]);
    setDraft("");
    setError("");
    inputRef.current?.focus();
  }

  async function send() {
    const content = draft.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { id: messageId("user"), role: "user", content };
    const priorMessages = messages.slice(-12);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: priorMessages.map(({ role, content: historyContent }) => ({ role, content: historyContent })),
          ...(useForgeProgress ? { forgeContext } : {}),
        }),
      });
      const body = (await response.json()) as CopilotResponse;
      if (!response.ok || !body.reply) throw new Error(body.error || "Copilot could not respond.");

      setMessages((current) => [
        ...current,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: body.reply,
          recommendedLesson: body.recommendedLesson,
          reason: body.reason,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Copilot could not respond.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#101c2a] shadow-2xl shadow-black/20" aria-labelledby="copilot-title">
      <header className="flex flex-col gap-4 border-b border-slate-700/80 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">FORGE Copilot · beta</p>
          <h1 id="copilot-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">Plan your next move.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">An optional thinking partner. It can suggest a path, but it never changes your progress.</p>
        </div>
        <button type="button" onClick={startNewChat} disabled={loading} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-teal-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
          New chat
        </button>
      </header>

      <div className="border-b border-slate-700/80 px-5 py-4 sm:px-6">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-teal-400/15 bg-teal-400/[.05] px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-slate-100">Use my FORGE progress</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-400">Share your campaign, lessons, XP, streak, stats, and saved goals with Copilot.</span>
          </span>
          <input
            type="checkbox"
            checked={useForgeProgress}
            onChange={(event) => setUseForgeProgress(event.target.checked)}
            className="size-4 accent-teal-400"
            aria-label="Use my FORGE progress"
          />
        </label>
      </div>

      <div className="min-h-[360px] max-h-[58vh] space-y-4 overflow-y-auto p-5 sm:p-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-4">
            <p className="text-sm leading-6 text-slate-400">Start a conversation for a recommendation, a plan, or a clearer next step.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => { setDraft(prompt); inputRef.current?.focus(); }} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-left text-xs font-medium text-slate-300 transition hover:border-teal-400/50 hover:text-teal-100">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-teal-400 px-4 py-3 text-sm text-slate-950" : "mr-auto max-w-[88%] rounded-2xl rounded-bl-md border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100"}>
              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
              {message.role === "assistant" && message.recommendedLesson ? <p className="mt-3 border-t border-slate-700 pt-3 text-xs font-semibold text-teal-200">Recommended lesson · {message.recommendedLesson}</p> : null}
              {message.role === "assistant" && message.reason ? <p className="mt-2 text-xs leading-5 text-slate-400">{message.reason}</p> : null}
            </article>
          ))
        )}
        {loading ? <div className="mr-auto inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300"><span className="size-2 animate-pulse rounded-full bg-teal-300" /> Copilot is thinking…</div> : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-slate-700/80 p-5 sm:p-6">
        {error ? <p className="mb-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200" role="alert">{error}</p> : null}
        <label className="sr-only" htmlFor="copilot-message">Message FORGE Copilot</label>
        <textarea ref={inputRef} id="copilot-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} maxLength={1200} rows={3} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" placeholder="Ask about your next step…" />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">Press ⌘/Ctrl + Enter to send</p>
          <button disabled={loading || !draft.trim()} className="rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-[#101c2a] disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
