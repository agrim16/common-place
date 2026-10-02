import { query } from "./_generated/server";

/**
 * Presence-only diagnostics for external keys. Returns booleans only —
 * never the values themselves.
 */
export const authSetup = query({
  args: {},
  handler: async (ctx) => {
    return {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      siteUrlSet: Boolean(process.env.CONVEX_SITE_URL),
      // Whether `convex run` callers carry an auth identity (diagnostics only).
      callerAuthed: Boolean(await ctx.auth.getUserIdentity()),
    };
  },
});
