"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

const MAX_HISTORY = 8;

/** Tried in order; the first that succeeds wins. */
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
].filter((model): model is string => Boolean(model));

type Attempt =
  | { kind: "ok"; answer: string }
  | { kind: "missing" } // model unavailable for this key — try the next one
  | { kind: "busy" } // 503/overloaded — worth one retry
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
  const detail = await response.text().catch(() => "");
  console.log(`[gemini] ${model} -> HTTP ${response.status}`);

  if (response.ok) {
    let answer = "";
    try {
      answer = await extractAnswer(JSON.parse(detail));
    } catch {
      answer = "";
    }
    if (answer) return { kind: "ok", answer };
    console.log(`[gemini] ${model} returned empty: ${detail.slice(0, 300)}`);
    return { kind: "missing" };
  }

  console.log(`[gemini] ${model} body: ${detail.slice(0, 300)}`);
  if (response.status === 404) return { kind: "missing" };
  if (response.status === 503) return { kind: "busy" };
  return { kind: "error", status: response.status };
}

/** Ask the account which generateContent models it can actually use. */
async function discoverModel(apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      { headers: { "x-goog-api-key": apiKey } },
    );
    if (!response.ok) {
      console.log(`[gemini] discovery list HTTP ${response.status}`);
      return null;
    }
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
    const picked =
      names.find((n) => n.includes("flash") && !n.startsWith("gemini-2.5")) ??
      names.find((n) => n.includes("flash")) ??
      names[0] ??
      null;
    console.log(`[gemini] discovery: ${names.length} models, picked ${picked}`);
    return picked;
  } catch (error) {
    console.log(`[gemini] discovery failed: ${String(error).slice(0, 200)}`);
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

    const candidates = [...CANDIDATE_MODELS];
    let busyRetries = 0;

    // Two passes: preferred models first, discovery appended, 503s retried once.
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 1) {
        const discovered = await discoverModel(apiKey);
        if (discovered && !candidates.includes(discovered)) {
          candidates.push(discovered);
        }
      }

      for (const model of candidates) {
        const attempt = await tryGenerate(model, apiKey, payload);
        if (attempt.kind === "ok") {
          return { answer: attempt.answer, model };
        }
        if (attempt.kind === "busy") {
          busyRetries += 1;
          if (busyRetries <= 3) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            continue;
          }
          continue;
        }
        if (attempt.kind === "error") {
          if (attempt.status === 429) {
            throw new Error(
              "The helper is rate-limited right now — wait a moment and try again.",
            );
          }
          throw new Error(
            `The study helper could not answer (HTTP ${attempt.status}).`,
          );
        }
        // missing → next model
      }
    }

    throw new Error(
      "No usable Gemini model was found for this API key — see server logs for the per-model HTTP statuses.",
    );
  },
});
