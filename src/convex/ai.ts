"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

const MODEL = "gemini-2.5-flash";
const MAX_HISTORY = 8;

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

    const contents = [
      ...args.history
        .slice(-MAX_HISTORY)
        .map((message) => ({
          role: message.role,
          parts: [{ text: message.text.slice(0, 2000) }],
        })),
      { role: "user" as const, parts: [{ text: question.slice(0, 4000) }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Gemini error", response.status, detail);
      throw new Error(
        response.status === 429
          ? "The helper is rate-limited right now — wait a moment and try again."
          : `The study helper could not answer (HTTP ${response.status}).`,
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const answer = (data.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!answer) throw new Error("The helper returned nothing — try rephrasing.");
    return { answer };
  },
});
