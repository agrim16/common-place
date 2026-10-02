"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";

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
 * Run a payload through the candidate models: preferred models first, model
 * discovery appended on the second pass, 503s retried. Shared by the study
 * helper and the quiz generator.
 */
async function generateText(
  apiKey: string,
  payload: unknown,
): Promise<{ text: string; model: string }> {
  const candidates = [...CANDIDATE_MODELS];
  let busyRetries = 0;

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
        return { text: attempt.answer, model };
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
}

async function requireApiKey(): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "The Gemini API key isn't set yet — add GEMINI_API_KEY to the project's API keys, then try again.",
    );
  }
  return apiKey;
}

/** Turn the student's attached photos into Gemini inline image parts. */
async function photoParts(ctx: ActionCtx, ids: Id<"noteImages">[] | undefined) {
  if (!ids?.length) return { parts: [], labels: [] };
  const photos = await ctx.runQuery(api.study.noteImageData, { ids });
  return {
    parts: photos.map((photo) => ({
      inlineData: { mimeType: photo.mimeType, data: photo.data },
    })),
    labels: photos.map((photo) => photo.title),
  };
}

/** Turn attached PDFs into Gemini inline document parts. */
async function fileParts(ctx: ActionCtx, ids: Id<"noteFiles">[] | undefined) {
  if (!ids?.length) return { parts: [], labels: [] };
  const files = await ctx.runQuery(api.study.noteFileData, { ids });
  return {
    parts: files.map((file) => ({
      inlineData: { mimeType: file.mimeType, data: file.data },
    })),
    labels: files.map((file) => `${file.title} (PDF)`),
  };
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
    photoIds: v.optional(v.array(v.id("noteImages"))),
    fileIds: v.optional(v.array(v.id("noteFiles"))),
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

    const apiKey = await requireApiKey();

    const context = await ctx.runQuery(api.study.helperContext, {
      noteId: args.noteId,
    });
    const photos = await photoParts(ctx, args.photoIds);
    const documents = await fileParts(ctx, args.fileIds);

    const system = [
      "You are the study helper inside Commonplace, a study desk for students.",
      "Be warm, concise and practical: short paragraphs, no filler, no markdown tables.",
      "Ground answers about progress in the student data below; if asked about progress, quote the actual numbers.",
      "If a note or any attached photo is given, treat it as the student's own study material — read handwriting and diagrams as best you can and say so if a photo is unclear.",
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
        {
          role: "user" as const,
          parts: [
            { text: question.slice(0, 4000) },
            ...(photos.parts.length > 0
              ? [
                  {
                    text: `Attached photos of the student's own notes: ${photos.labels.join(", ")}.`,
                  },
                  ...photos.parts,
                ]
              : []),
            ...(documents.parts.length > 0
              ? [
                  {
                    text: `Attached PDFs from the student's own library: ${documents.labels.join(", ")}.`,
                  },
                  ...documents.parts,
                ]
              : []),
          ],
        },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    const { text, model } = await generateText(apiKey, payload);
    return { answer: text, model };
  },
});

/* ------------------------------- Quizzes ------------------------------- */

export type QuizQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

/** Pull the first JSON object out of a model answer, fences and all. */
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The quiz came back unreadable — try the topic again.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The quiz came back unreadable — try the topic again.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The quiz came back unreadable — try the topic again.");
  }
  return parsed as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Keep only well-formed questions so the UI never has to defend itself. */
function normaliseQuestions(raw: unknown, wanted: number): QuizQuestion[] {
  const list = Array.isArray(raw) ? raw : [];
  const questions: QuizQuestion[] = [];
  for (const entry of list) {
    if (questions.length >= wanted) break;
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const prompt =
      asString(item.question) || asString(item.prompt) || asString(item.title);
    if (!prompt) continue;
    const options = Array.isArray(item.options)
      ? item.options.map(asString).filter(Boolean)
      : [];
    const answerIndex = Math.trunc(Number(item.answerIndex ?? item.answer));
    if (options.length < 2 || !Number.isInteger(answerIndex)) continue;
    if (answerIndex < 0 || answerIndex >= options.length) continue;
    questions.push({
      prompt: prompt.slice(0, 400),
      options: options.slice(0, 6).map((option) => option.slice(0, 160)),
      answerIndex,
      explanation: asString(item.explanation).slice(0, 600),
    });
  }
  return questions;
}

/**
 * Read a photographed page: transcribe what is there, then summarise it into
 * the notes the student can rename and study from.
 */
export const summarizePhoto = action({
  args: { imageId: v.id("noteImages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use your notes.");

    const photos = await ctx.runQuery(api.study.noteImageData, {
      ids: [args.imageId],
    });
    const photo = photos[0];
    if (!photo) throw new Error("That photo isn't yours.");

    const apiKey = await requireApiKey();
    const attached = await photoParts(ctx, [args.imageId]);

    const prompt = [
      "You are reading a photograph of a student's notebook page.",
      "Transcribe the page faithfully first — handwriting, headings, lists, diagrams described in words.",
      "Then summarise it for revision.",
      "",
      'Reply with JSON only: {"summary":"3-6 sentences on what this page covers","keyPoints":["5-8 short bullet points of the actual content"],"subject":"the single subject or topic this page belongs to"}',
      "If the photo is too blurred or cropped to read, say so in the summary and return no key points.",
    ].join("\n");

    const payload = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: prompt }, ...attached.parts],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    };

    const { text, model } = await generateText(apiKey, payload);
    const parsed = extractJson(text);
    const summary = asString(parsed.summary) || "No summary could be read.";
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map(asString).filter(Boolean)
      : [];

    await ctx.runMutation(api.study.setNoteImageSummary, {
      id: args.imageId,
      summary,
      keyPoints,
    });

    return { summary, keyPoints, model, userId };
  },
});

/** Read an uploaded PDF: what it covers, and the facts worth revising. */
export const summarizeFile = action({
  args: { fileId: v.id("noteFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use your notes.");

    const files = await ctx.runQuery(api.study.noteFileData, {
      ids: [args.fileId],
    });
    const file = files[0];
    if (!file) throw new Error("That file isn't yours, or upload was cut short.");

    const apiKey = await requireApiKey();
    const attached = await fileParts(ctx, [args.fileId]);

    const prompt = [
      `You are reading a PDF from a student's library, titled "${file.title}".`,
      "Summarise it for revision.",
      "",
      'Reply with JSON only: {"summary":"4-6 sentences on what this document covers","keyPoints":["6-10 short bullet points of the actual examinable content"],"subject":"the single subject or topic this belongs to"}',
      "If the PDF is scanned with no readable text, say so in the summary.",
    ].join("\n");

    const payload = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: prompt }, ...attached.parts],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    };

    const { text, model } = await generateText(apiKey, payload);
    const parsed = extractJson(text);
    const summary = asString(parsed.summary) || "No summary could be read.";
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map(asString).filter(Boolean)
      : [];

    await ctx.runMutation(api.study.setNoteFileSummary, {
      id: args.fileId,
      summary,
      keyPoints,
    });

    return { summary, keyPoints, model, userId };
  },
});

/**
 * Build a multiple-choice quiz on any topic with Gemini. When the student picks
 * a note, the quiz is written from that note's own material.
 */
export const generateQuiz = action({
  args: {
    topic: v.string(),
    count: v.optional(v.number()),
    noteId: v.optional(v.id("notes")),
    photoIds: v.optional(v.array(v.id("noteImages"))),
    fileIds: v.optional(v.array(v.id("noteFiles"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to take a quiz.");

    const topic = args.topic.trim();
    if (!topic) throw new Error("Name a topic first — e.g. “Photosynthesis”.");

    const count = Math.min(Math.max(Math.trunc(args.count ?? 5), 1), 20);
    const apiKey = await requireApiKey();

    const note = args.noteId ? await ctx.runQuery(api.study.quizSource, {
      noteId: args.noteId,
    }) : null;

    const photos = await photoParts(ctx, args.photoIds);
    const documents = await fileParts(ctx, args.fileIds);

    const source = [
      note
        ? `Write the quiz from the student's own note, titled “${note.title}”:\n"""\n${note.body.slice(0, 8000)}\n"""`
        : "Write the quiz from your own knowledge of the topic.",
      ...(photos.parts.length > 0
        ? [
            `Also use the attached photos of the student's handwritten notes (${photos.labels.join(", ")}) as source material — transcribe them before writing questions.`,
          ]
        : []),
      ...(documents.parts.length > 0
        ? [
            `Also use the attached PDFs (${documents.labels.join(", ")}) as source material — read them before writing questions.`,
          ]
        : []),
    ].join("\n");

    const prompt = [
      `Set a ${count}-question multiple-choice quiz on: ${topic.slice(0, 200)}.`,
      source,
      "Rules:",
      "- Every question must have exactly 4 short options, labelled A to D by position.",
      "- Exactly one option is correct; distractors must be plausible and clearly wrong.",
      "- Vary the difficulty: easy, medium, then harder.",
      "- Add a one or two sentence explanation for the correct answer.",
      "",
      'Reply with JSON only, in this shape: {"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}',
      `Return exactly ${count} questions and no other keys.`,
    ].join("\n");

    const payload = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: prompt }, ...photos.parts, ...documents.parts],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: Math.min(8192, 800 + count * 320),
      },
    };

    const { text, model } = await generateText(apiKey, payload);
    const questions = normaliseQuestions(extractJson(text).questions, count);
    if (questions.length < 2) {
      throw new Error(
        "The quiz came back too thin to use — try naming a narrower topic.",
      );
    }

    return { topic, model, questions };
  },
});