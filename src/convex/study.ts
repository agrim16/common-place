import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const timeFormat = /^\d{2}:[0-5]\d$/;

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  return userId;
}

/* ------------------------------ Timetable ------------------------------ */

export const listTimetable = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const entries = await ctx.db
      .query("timetableEntries")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();
    return entries.sort(
      (a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime),
    );
  },
});

export const createTimetableEntry = mutation({
  args: {
    day: v.number(),
    subject: v.string(),
    note: v.optional(v.string()),
    startTime: v.string(),
    endTime: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!Number.isInteger(args.day) || args.day < 0 || args.day > 6) {
      throw new Error("Day must be 0 (Sunday) through 6 (Saturday)");
    }
    const subject = args.subject.trim();
    if (!subject) throw new Error("Subject is required");
    if (!timeFormat.test(args.startTime) || !timeFormat.test(args.endTime)) {
      throw new Error("Times must be in HH:MM format");
    }
    if (args.startTime >= args.endTime) {
      throw new Error("The period must end after it starts");
    }
    await ctx.db.insert("timetableEntries", {
      userId,
      day: args.day,
      subject: subject.slice(0, 80),
      note: args.note?.trim().slice(0, 140) || undefined,
      startTime: args.startTime,
      endTime: args.endTime,
    });
  },
});

export const deleteTimetableEntry = mutation({
  args: { id: v.id("timetableEntries") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const entry = await ctx.db.get(id);
    if (!entry) return;
    if (entry.userId !== userId) throw new Error("Not your entry");
    await ctx.db.delete(id);
  },
});

/* ------------------------------ Reminders ------------------------------ */

export const listReminders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return reminders.sort((a, b) => a.time - b.time);
  },
});

export const addReminder = mutation({
  args: {
    title: v.string(),
    time: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trimmed = args.title.trim();
    if (!trimmed) throw new Error("Give the reminder a title");
    if (!Number.isFinite(args.time)) throw new Error("Invalid reminder time");
    await ctx.db.insert("reminders", {
      userId,
      title: trimmed.slice(0, 140),
      time: args.time,
      done: false,
      createdAt: Date.now(),
    });
  },
});

export const setReminderDone = mutation({
  args: { id: v.id("reminders"), done: v.boolean() },
  handler: async (ctx, { id, done }) => {
    const userId = await requireUser(ctx);
    const reminder = await ctx.db.get(id);
    if (!reminder) return;
    if (reminder.userId !== userId) throw new Error("Not your reminder");
    await ctx.db.patch(id, { done });
  },
});

export const deleteReminder = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const reminder = await ctx.db.get(id);
    if (!reminder) return;
    if (reminder.userId !== userId) throw new Error("Not your reminder");
    await ctx.db.delete(id);
  },
});

/* --------------------------- Focus sessions --------------------------- */

export const focusSummary = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { minutes: 0, sessions: 0 };
    const sessions = await ctx.db
      .query("focusSessions")
      .withIndex("by_user_startedAt", (q) =>
        q.eq("userId", userId).gte("startedAt", since),
      )
      .collect();
    return {
      minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
      sessions: sessions.length,
    };
  },
});

export const logFocusSession = mutation({
  args: {
    subject: v.optional(v.string()),
    minutes: v.number(),
    mode: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!Number.isFinite(args.minutes) || args.minutes <= 0) return;
    await ctx.db.insert("focusSessions", {
      userId,
      subject: args.subject?.trim().slice(0, 80) || undefined,
      minutes: Math.min(Math.round(args.minutes), 600),
      mode: args.mode.slice(0, 32),
      startedAt: args.startedAt,
    });
  },
});

/* ------------------- XP, levels & the scoreboard ------------------- */

export const progress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { xp: 0, sessions: 0 };
    const sessions = await ctx.db
      .query("focusSessions")
      .withIndex("by_user_startedAt", (q) => q.eq("userId", userId))
      .collect();
    return {
      xp: sessions.reduce((sum, s) => sum + s.minutes, 0),
      sessions: sessions.length,
    };
  },
});

/** Weekly minutes per student, ranked. Includes the caller's own row. */
export const scoreboard = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { rows: [], me: null };
    const sessions = await ctx.db
      .query("focusSessions")
      .withIndex("by_startedAt", (q) => q.gte("startedAt", since))
      .collect();

    const totals = new Map<string, { minutes: number; sessions: number }>();
    for (const session of sessions) {
      const current = totals.get(session.userId) ?? { minutes: 0, sessions: 0 };
      current.minutes += session.minutes;
      current.sessions += 1;
      totals.set(session.userId, current);
    }

    const rows = await Promise.all(
      [...totals.entries()].map(async ([id, total]) => {
        const user = await ctx.db.get(id as Id<"users">);
        return {
          userId: id,
          name: user?.name ?? user?.email ?? "Anonymous student",
          minutes: total.minutes,
          sessions: total.sessions,
          isMe: id === userId,
        };
      }),
    );
    rows.sort(
      (a, b) => b.minutes - a.minutes || b.sessions - a.sessions,
    );
    const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      rows: ranked.slice(0, 8),
      me: ranked.find((row) => row.isMe) ?? null,
    };
  },
});

/* ------------------------------- Quizzes ------------------------------- */

/** One of the caller's notes, used as the source material for a quiz. */
export const quizSource = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to take a quiz.");
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId) {
      throw new Error("That note isn't yours.");
    }
    return { title: note.title, body: note.body };
  },
});

export const recordQuizAttempt = mutation({
  args: {
    topic: v.string(),
    total: v.number(),
    correct: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const topic = args.topic.trim();
    if (!topic) throw new Error("A quiz needs a topic.");
    await ctx.db.insert("quizAttempts", {
      userId,
      topic: topic.slice(0, 120),
      total: Math.max(1, Math.round(args.total)),
      correct: Math.max(0, Math.round(args.correct)),
      createdAt: Date.now(),
    });
  },
});

export const listQuizAttempts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const attempts = await ctx.db
      .query("quizAttempts")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .collect();
    return attempts.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  },
});

/* ---------------------------- Note photos ---------------------------- */

const PHOTO_MIME = "image/jpeg";
const MAX_PHOTO_CHARS = 800_000; // ~600 KB once decoded

/** Photo library — thumbnails only, never the full base64 payload. */
export const listNoteImages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const photos = await ctx.db
      .query("noteImages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return photos
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ _id, title, thumb, createdAt }) => ({
        _id,
        title,
        thumb,
        createdAt,
      }));
  },
});

export const createNoteImage = mutation({
  args: {
    title: v.string(),
    mimeType: v.string(),
    data: v.string(),
    thumb: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Give the photo a title");
    if (args.mimeType !== PHOTO_MIME) {
      throw new Error("Photos are stored as JPEG.");
    }
    if (!args.data || args.data.length > MAX_PHOTO_CHARS) {
      throw new Error("That photo is too large — try a smaller one.");
    }
    return await ctx.db.insert("noteImages", {
      userId,
      title: title.slice(0, 120),
      mimeType: PHOTO_MIME,
      data: args.data,
      thumb: args.thumb.slice(0, 120_000),
      createdAt: Date.now(),
    });
  },
});

export const deleteNoteImage = mutation({
  args: { id: v.id("noteImages") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const photo = await ctx.db.get(id);
    if (!photo) return;
    if (photo.userId !== userId) throw new Error("Not your photo");
    await ctx.db.delete(id);
  },
});

/** Full image data for the AI, ownership-checked. Server-side only. */
export const noteImageData = query({
  args: { ids: v.array(v.id("noteImages")) },
  handler: async (ctx, { ids }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const photos = await Promise.all(ids.slice(0, 4).map((id) => ctx.db.get(id)));
    return photos
      .filter(
        (photo): photo is NonNullable<typeof photo> =>
          !!photo && photo.userId === userId,
      )
      .map((photo) => ({
        title: photo.title,
        mimeType: photo.mimeType,
        data: photo.data,
      }));
  },
});

/* --------------------------- Notes library --------------------------- */

export const listNotes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createNote = mutation({
  args: { title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trimmedTitle = args.title.trim();
    const trimmedBody = args.body.trim();
    if (!trimmedTitle) throw new Error("Give the note a title");
    if (!trimmedBody) throw new Error("The note is empty");
    await ctx.db.insert("notes", {
      userId,
      title: trimmedTitle.slice(0, 120),
      body: trimmedBody.slice(0, 30_000),
      createdAt: Date.now(),
    });
  },
});

export const deleteNote = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const note = await ctx.db.get(id);
    if (!note) return;
    if (note.userId !== userId) throw new Error("Not your note");
    await ctx.db.delete(id);
  },
});

/* ------------------------- Study helper context ------------------------- */

/** Everything the AI helper is allowed to know about the caller. */
export const helperContext = query({
  args: { noteId: v.optional(v.id("notes")) },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const since = startOfDay.getTime();

    const [sessions, timetable, reminders, quizzes] = await Promise.all([
      ctx.db
        .query("focusSessions")
        .withIndex("by_user_startedAt", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("timetableEntries")
        .withIndex("by_user_day", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("reminders")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("quizAttempts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const note = noteId ? await ctx.db.get(noteId) : null;
    const ownedNote = note && note.userId === userId ? note : null;
    const today = sessions.filter((s) => s.startedAt >= since);

    return {
      today: new Date().toISOString().slice(0, 10),
      xp: sessions.reduce((sum, s) => sum + s.minutes, 0),
      focusMinutesToday: today.reduce((sum, s) => sum + s.minutes, 0),
      sessionsToday: today.length,
      subjectsStudiedToday: [
        ...new Set(today.map((s) => s.subject).filter(Boolean)),
      ],
      timetable: timetable.map((e) => ({
        day: e.day,
        subject: e.subject,
        note: e.note,
        start: e.startTime,
        end: e.endTime,
      })),
      openReminders: reminders
        .filter((r) => !r.done)
        .map((r) => r.title),
      quizzes: {
        taken: quizzes.length,
        questions: quizzes.reduce((sum, q) => sum + q.total, 0),
        correct: quizzes.reduce((sum, q) => sum + q.correct, 0),
        recentTopics: [...new Set(quizzes.map((q) => q.topic))].slice(0, 5),
      },
      note: ownedNote
        ? { title: ownedNote.title, body: ownedNote.body.slice(0, 12_000) }
        : null,
    };
  },
});