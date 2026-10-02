import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

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
  handler: async (ctx, { title, time }) => {
    const userId = await requireUser(ctx);
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Give the reminder a title");
    if (!Number.isFinite(time)) throw new Error("Invalid reminder time");
    await ctx.db.insert("reminders", {
      userId,
      title: trimmed.slice(0, 140),
      time,
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
