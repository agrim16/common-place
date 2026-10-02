"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

const MAX_HISTORY = 8;

/** Tried in order; the first that exists on this key's account wins. */
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
].filter((model): model is string => Boolean(model));

type Attempt =
  | { kind: "ok"; answer: string }
  | { kind: "missing" }
  | { kind: "error"; status: number };

async function extractAnswer(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): Promise<string> {
  return (data.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function tryGenerate(
  model: string,
  apiKey: string,
  payload: unknown,
): Promise<Attempt> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
    },
  );
  if (response.ok) {
    const answer = await extractAnswer(await response.json());
    return answer ? { kind: "ok", answer } : { kind: "missing" };
  }
  if (response.status === 404 || response.status === 503) {
    return { kind: "missing" };
  }
  const detail = await response.text().catch(() => "");
  console.error("Gemini error", model, response.status, detail);
  return { kind: "error", status: response.status };
}

/** Ask the account which generateContent models it can actually use. */
async function discoverModel(apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      { headers: { "x-goog-api-key": apiKey } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const names = (data.models ?? [])
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    return (
      names.find((n) => n.includes("flash") && !n.startsWith("gemini-2.5")) ??
      names.find((n) => n.includes("flash")) ??
      names[0] ??
      null
    );
  } catch (error) {
    console.error("Model discovery failed", error);
    return null;
  }
}

/**
 * The study helper: a Gemini-backed tutor that can see the student's day —
 * today's focus minutes, timetable, open reminders and optionally an uploaded
 * note — so answers about progress and "what should I study next" are grounded.
 */
export const askStudyHelper = action({
  args: {
    question: v.string(),
    noteId: v.optional(v.id("notes")),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("model")),
        text: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use the study helper.");

    const question = args.question.trim();
    if (!question) throw new Error("Ask a question first.");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "The Gemini API key isn't set yet — add GEMINI_API_KEY to the project's API keys, then try again.",
      );
    }

    const context = await ctx.runQuery(api.study.helperContext, {
      noteId: args.noteId,
    });

    const system = [
      "You are the study helper inside Commonplace, a study desk for students.",
      "Be warm, concise and practical: short paragraphs, no filler, no markdown tables.",
      "Ground answers about progress in the student data below; if asked about progress, quote the actual numbers.",
      "If a note is attached, treat it as the student's own study material.",
      "You help with study planning, revision techniques, explanations and motivation — nothing else.",
      "",
      `Student data (JSON): ${JSON.stringify(context)}`,
    ].join("\n");

    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...args.history
          .slice(-MAX_HISTORY)
          .map((message) => ({
            role: message.role,
            parts: [{ text: message.text.slice(0, 2000) }],
          })),
        { role: "user" as const, parts: [{ text: question.slice(0, 4000) }] },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    // Preferred models first, then whatever this key can actually use.
    for (const model of CANDIDATE_MODELS) {
      const attempt = await tryGenerate(model, apiKey, payload);
      if (attempt.kind === "ok") return { answer: attempt.answer, model };
      if (attempt.kind === "error" && attempt.status === 429) {
        throw new Error(
          "The helper is rate-limited right now — wait a moment and try again.",
        );
      }
      if (attempt.kind === "error") {
        throw new Error(
          `The study helper could not answer (HTTP ${attempt.status}).`,
        );
      }
    }

    const discovered = await discoverModel(apiKey);
    if (discovered) {
      const attempt = await tryGenerate(discovered, apiKey, payload);
      if (attempt.kind === "ok") return { answer: attempt.answer, model: discovered };
    }

    throw new Error(
      "No usable Gemini model was found for this API key — check GEMINI_API_KEY (or set GEMINI_MODEL).",
    );
  },
});
