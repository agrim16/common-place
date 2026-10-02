"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";

const MAX_HISTORY = 8;

/**
 * Gemini rejects inline requests over roughly 20 MB, and base64 inflates the
 * bytes by 4:3 — so this is the largest PDF we will actually send.
 */
const MAX_INLINE_PDF_BYTES = 14 * 1024 * 1024;

/** Tried in order; the first that succeeds wins. */
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
].filter((model): model is string => Boolean(model));

/**
 * Reading a page or a document is the hardest thing we ask Gemini to do, so it
 * gets first refusal on a stronger model when the key has one. Set
 * GEMINI_READ_MODEL to pin it; otherwise we just try before falling back.
 */
const READ_MODEL_CANDIDATES = [
  process.env.GEMINI_READ_MODEL,
  "gemini-3.1-pro-preview",
  "gemini-pro-latest",
  ...CANDIDATE_MODELS,
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
      names.find((n) => n.includes("pro") && !n.startsWith("gemini-2.5")) ??
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
 * helper, the quiz generator and the reading desk.
 */
async function generateText(
  apiKey: string,
  payload: unknown,
  preferred: string[] = CANDIDATE_MODELS,
): Promise<{ text: string; model: string }> {
  const candidates = [...preferred];
  let busyRetries = 0;
  let rateLimits = 0;

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
          // Quota is per model, so a throttled pro model says nothing about
          // flash. Back off briefly, then fall through to the next candidate
          // rather than failing the whole request on the first 429.
          rateLimits += 1;
          console.log(
            `[gemini] rate limited on ${model} (${rateLimits}) — trying the next model`,
          );
          if (rateLimits <= 3) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1200 * rateLimits),
            );
            continue;
          }
          throw new Error(
            "Gemini is rate-limiting every model right now — wait a moment and try again.",
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

/* ----------------------------- Reading desk ----------------------------- */

/**
 * A real response schema — rather than "please reply with JSON" — is what
 * stops the model drifting into prose or wrapping its answer in code fences.
 */
const READING_SCHEMA = {
  type: "object",
  properties: {
    suggestedTitle: {
      type: "string",
      description:
        "A short, specific title of at most 6 words, as a teacher would name it.",
    },
    subject: {
      type: "string",
      description: "The single subject this belongs to, e.g. 'Biology'.",
    },
    transcript: {
      type: "string",
      description:
        "A faithful transcription of everything legible, in reading order. Write [illegible] rather than guessing.",
    },
    summary: {
      type: "string",
      description:
        "4-6 sentences on what this material covers, written for the student who owns it.",
    },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      description:
        "6-10 examinable facts taken only from this material. No filler, no generic study advice.",
    },
    keyTerms: {
      type: "array",
      items: { type: "string" },
      description: "Up to 12 defined terms in 'term — definition' form.",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description:
        "Empty unless something is genuinely unreadable. Say exactly what, e.g. 'Bottom-left diagram is cropped out of frame'.",
    },
  },
  required: [
    "suggestedTitle",
    "subject",
    "transcript",
    "summary",
    "keyPoints",
    "keyTerms",
    "warnings",
  ],
} as const;

const SYSTEM_FOR_READING = [
  "You are the reading desk inside Commonplace, a study app for students.",
  "You read photographs of handwritten notes and PDF documents, then turn them into usable revision material.",
  "Rules you never break:",
  "- Transcribe before you summarise. If you cannot read something, write [illegible] and add a warning.",
  "- Never invent content that is not there. An honest gap beats a confident guess.",
  "- Prefer the student's own vocabulary and structure over your own phrasing.",
  "- Describe diagrams in words — what is plotted, what the axes are, what the shape shows.",
].join("\n");

type Reading = {
  model: string;
  subject: string;
  suggestedTitle: string;
  transcript: string;
  summary: string;
  keyPoints: string[];
  keyTerms: string[];
  warnings: string[];
};

/** Schema-locked, low-temperature read. */
async function readMaterial(
  ctx: ActionCtx,
  apiKey: string,
  prompt: string,
  parts: unknown[],
): Promise<Reading> {
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_FOR_READING }] },
    contents: [{ role: "user" as const, parts: [{ text: prompt }, ...parts] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: READING_SCHEMA,
    },
  };
  const { text, model } = await generateText(
    apiKey,
    payload,
    READ_MODEL_CANDIDATES,
  );
  const parsed = extractJson(text);
  return {
    model,
    subject: asString(parsed.subject),
    suggestedTitle: asString(parsed.suggestedTitle),
    transcript: asString(parsed.transcript),
    summary: asString(parsed.summary),
    keyPoints: stringList(parsed.keyPoints, 10),
    keyTerms: stringList(parsed.keyTerms, 12),
    warnings: stringList(parsed.warnings, 5),
  };
}

function stringList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean).slice(0, limit)
    : [];
}

/**
 * Read a photographed page: transcribe it, summarise it, and suggest a real
 * name for it. The transcript is stored so later quizzes and questions never
 * have to re-read the handwriting.
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
      "Read this photograph of a student's notebook page.",
      "It is a single page, so be exhaustive: every heading, list, diagram label and margin note that is legible.",
      `The student filed it as "${photo.title}", which is usually a camera filename — so propose a real title.`,
      "Put anything unreadable in `warnings` and mark it [illegible] in the transcript.",
    ].join("\n");

    const read = await readMaterial(ctx, apiKey, prompt, attached.parts);

    await ctx.runMutation(api.study.setNoteImageSummary, {
      id: args.imageId,
      summary: read.summary || "Nothing on this page could be read.",
      transcript: read.transcript,
      keyPoints: read.keyPoints,
      keyTerms: read.keyTerms,
      warnings: read.warnings,
      suggestedTitle: read.suggestedTitle,
    });

    return { ...read, userId };
  },
});

/** Read an uploaded PDF the same way, from the bytes in file storage. */
export const summarizeFile = action({
  args: { fileId: v.id("noteFiles") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to use your notes.");

    const files = await ctx.runQuery(api.study.noteFileSource, {
      ids: [args.fileId],
    });
    const file = files[0];
    if (!file) throw new Error("That file isn't yours.");

    const apiKey = await requireApiKey();
    const attached = await fileParts(ctx, apiKey, [args.fileId]);
    if (attached.parts.length === 0) {
      throw new Error("That PDF is too large for the AI to read — try a shorter one.");
    }

    const prompt = [
      `Read this PDF from a student's library, filed as "${file.title}".`,
      "Work through it in order and keep the document's own structure.",
      `The student filed it as "${file.title}", which may be a filename rather than a real title — so propose a real one.`,
      "If the PDF is a scan with no readable text layer, say so in `warnings` and leave the transcript empty rather than inventing one.",
    ].join("\n");

    const read = await readMaterial(ctx, apiKey, prompt, attached.parts);

    await ctx.runMutation(api.study.setNoteFileSummary, {
      id: args.fileId,
      summary: read.summary || "Nothing in this document could be read.",
      transcript: read.transcript,
      keyPoints: read.keyPoints,
      keyTerms: read.keyTerms,
      warnings: read.warnings,
      suggestedTitle: read.suggestedTitle,
    });

    return { ...read, userId };
  },
});

/* ---------------------------- Attachments ---------------------------- */

/** Turn photos into Gemini inline image parts. */
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

/** Turn PDFs in storage into Gemini parts, whatever their size. */
async function fileParts(
  ctx: ActionCtx,
  apiKey: string,
  ids: Id<"noteFiles">[] | undefined,
) {
  if (!ids?.length) return { parts: [], labels: [], tooBig: [] as string[] };
  const files = await ctx.runQuery(api.study.noteFileSource, { ids });
  const parts: Array<Record<string, unknown>> = [];
  const labels: string[] = [];
  const tooBig: string[] = [];

  for (const file of files) {
    const part = await pdfPart(ctx, apiKey, file);
    if (!part) {
      tooBig.push(file.title);
      continue;
    }
    parts.push(part);
    labels.push(`${file.title} (PDF)`);
  }

  return { parts, labels, tooBig };
}

/** Gemini Files API handles expire after 48h, so refresh well before that. */
const GEMINI_HANDLE_TTL = 40 * 60 * 60 * 1000;

/**
 * One PDF, the cheapest way we can give it to Gemini: a cached Files API
 * handle if we have a fresh one, otherwise the bytes inline (which is fine for
 * anything small), otherwise upload it once to the Files API and keep the
 * handle for the next two days.
 */
async function pdfPart(
  ctx: ActionCtx,
  apiKey: string,
  file: {
    _id: Id<"noteFiles">;
    storageId: string;
    bytes: number;
    mimeType: string;
    geminiUri?: string;
    geminiAt?: number;
  },
): Promise<Record<string, unknown> | null> {
  if (file.geminiUri && file.geminiAt && Date.now() - file.geminiAt < GEMINI_HANDLE_TTL) {
    return {
      fileData: { mimeType: file.mimeType, fileUri: file.geminiUri },
    };
  }

  const blob = await ctx.storage.get(file.storageId);
  if (!blob) return null;

  if (file.bytes <= MAX_INLINE_PDF_BYTES) {
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType: file.mimeType, data } };
  }

  // Too big to inline: hand it to the Files API once, then reference it.
  try {
    const uri = await uploadToGeminiFiles(apiKey, blob, file._id);
    await ctx.runMutation(api.study.cacheGeminiFile, { id: file._id, uri });
    return { fileData: { mimeType: file.mimeType, fileUri: uri } };
  } catch (error) {
    console.log(`[gemini] files upload failed: ${String(error).slice(0, 200)}`);
    return null;
  }
}

/**
 * Upload a blob to the Gemini Files API with the resumable protocol and return
 * its fileUri. This is what removes the ~14 MB inline ceiling: the document is
 * uploaded once and referenced by handle from then on.
 */
async function uploadToGeminiFiles(
  apiKey: string,
  blob: Blob,
  displayName: string,
): Promise<string> {
  const start = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(blob.size),
        "X-Goog-Upload-Header-Content-Type": blob.type || "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );
  if (!start.ok) {
    throw new Error(`files.start HTTP ${start.status}: ${await start.text()}`);
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("files.start returned no upload URL");

  const bytes = Buffer.from(await blob.arrayBuffer());
  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!done.ok) {
    throw new Error(`files.upload HTTP ${done.status}: ${await done.text()}`);
  }
  const { file } = (await done.json()) as { file?: { name?: string; uri?: string } };
  const name = file?.name;
  if (!name) throw new Error("files.upload returned no file name");

  // The file is usable only once Gemini finishes processing it.
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}`,
      { headers: { "x-goog-api-key": apiKey } },
    );
    if (!status.ok) continue;
    const info = (await status.json()) as { state?: string };
    if (info.state === "ACTIVE") {
      return file?.uri ?? `https://generativelanguage.googleapis.com/v1beta/${name}`;
    }
    if (info.state === "FAILED") throw new Error("Gemini could not process the PDF");
  }
  throw new Error("Gemini did not finish processing the PDF in time");
}

/**
 * Prefer text we have already read. Re-sending a photograph or a PDF costs
 * bandwidth and tokens, and Gemini reads it less accurately the second time —
 * so once something has a stored transcript we use that instead.
 */
async function transcriptSources(
  ctx: ActionCtx,
  photoIds: Id<"noteImages">[] | undefined,
  fileIds: Id<"noteFiles">[] | undefined,
) {
  const blocks: string[] = [];
  const needPhotos: Id<"noteImages">[] = [];
  const needFiles: Id<"noteFiles">[] = [];

  if (photoIds?.length) {
    const rows = await ctx.runQuery(api.study.noteImageTranscripts, {
      ids: photoIds,
    });
    const read = new Set(
      rows.filter((row) => row.transcript).map((row) => row._id),
    );
    for (const row of rows) {
      if (row.transcript) {
        blocks.push(
          `From the photographed page titled "${row.title}":\n"""\n${row.transcript.slice(0, 9000)}\n"""`,
        );
      }
    }
    for (const id of photoIds) if (!read.has(id)) needPhotos.push(id);
  }

  if (fileIds?.length) {
    const rows = await ctx.runQuery(api.study.noteFileSource, { ids: fileIds });
    const read = new Set(
      rows.filter((row) => row.transcript).map((row) => row._id),
    );
    for (const row of rows) {
      if (row.transcript) {
        blocks.push(
          `From the PDF titled "${row.title}":\n"""\n${row.transcript.slice(0, 9000)}\n"""`,
        );
      }
    }
    for (const id of fileIds) if (!read.has(id)) needFiles.push(id);
  }

  return { text: blocks.join("\n\n"), needPhotos, needFiles };
}

/* ---------------------------- Study helper ---------------------------- */

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
    const read = await transcriptSources(
      ctx,
      args.photoIds,
      args.fileIds,
    );
    // Only send the raw material when we have no stored transcription of it.
    const photos = await photoParts(ctx, read.needPhotos);
    const documents = await fileParts(ctx, apiKey, read.needFiles);

    const system = [
      "You are the study helper inside Commonplace, a study desk for students.",
      "Be warm, concise and practical: short paragraphs, no filler, no markdown tables.",
      "Ground answers about progress in the student data below; if asked about progress, quote the actual numbers.",
      "Anything quoted as material below is the student's own notes, already transcribed — rely on it rather than re-reading an image.",
      "If raw photos or PDFs are attached, treat them as their own study material and say so if something is unclear.",
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
            ...(read.text
              ? [
                  {
                    text: `The student's own material, already transcribed:\n${read.text}`,
                  },
                ]
              : []),
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
 * Build a multiple-choice quiz on any topic with Gemini. When the student picks
 * a note, a photograph or a PDF, the paper is written from their own material.
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

    const note = args.noteId
      ? await ctx.runQuery(api.study.quizSource, { noteId: args.noteId })
      : null;

    const read = await transcriptSources(ctx, args.photoIds, args.fileIds);
    const photos = await photoParts(ctx, read.needPhotos);
    const documents = await fileParts(ctx, apiKey, read.needFiles);

    const source = [
      note
        ? `Write the quiz from the student's own note, titled “${note.title}”:\n"""\n${note.body.slice(0, 8000)}\n"""`
        : read.text
          ? `Write the quiz from the student's own material below. Ask only about what appears in it.\n${read.text}`
          : "Write the quiz from your own knowledge of the topic.",
      ...(photos.parts.length > 0
        ? [
            `Also use the attached photographs (${photos.labels.join(", ")}) as source material — transcribe them before writing questions.`,
          ]
        : []),
      ...(documents.tooBig.length > 0
        ? [
            `The student also attached these PDFs but they are too large to read: ${documents.tooBig.join(", ")} — do not pretend to have read them.`,
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
      "- Ask about the specific content in front of you, not generic questions anyone could answer without reading it.",
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