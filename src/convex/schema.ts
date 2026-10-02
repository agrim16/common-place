import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Study desk: the weekly timetable for a student's day
    timetableEntries: defineTable({
      userId: v.id("users"),
      day: v.number(), // 0 = Sunday … 6 = Saturday
      subject: v.string(),
      note: v.optional(v.string()),
      startTime: v.string(), // "HH:MM", 24-hour local time
      endTime: v.string(), // "HH:MM", 24-hour local time
    }).index("by_user_day", ["userId", "day"]),

    // Study desk: reminders (assignments, revisions, touch-grass breaks)
    reminders: defineTable({
      userId: v.id("users"),
      title: v.string(),
      time: v.number(), // epoch ms when the reminder fires
      done: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_time", ["userId", "time"]),

    // Study desk: completed focus / revision sessions
    focusSessions: defineTable({
      userId: v.id("users"),
      subject: v.optional(v.string()),
      minutes: v.number(),
      mode: v.string(), // "focus" | "revision" | "break"
      startedAt: v.number(),
    }).index("by_user_startedAt", ["userId", "startedAt"])
      .index("by_startedAt", ["startedAt"]),

    // Study desk: photos of handwritten notes, downscaled on the client
    noteImages: defineTable({
      userId: v.id("users"),
      title: v.string(),
      mimeType: v.string(), // always image/jpeg after downscaling
      data: v.string(), // base64, no data: prefix
      thumb: v.string(), // small base64 preview for the library list
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // Study desk: AI quiz attempts, kept for the student's own record
    quizAttempts: defineTable({
      userId: v.id("users"),
      topic: v.string(),
      total: v.number(),
      correct: v.number(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_createdAt", ["userId", "createdAt"]),

    // Study desk: the student's library of uploaded notes
    notes: defineTable({
      userId: v.id("users"),
      title: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
