import { query } from "./_generated/server";

/**
 * Presence-only diagnostics for external keys. Returns booleans only —
 * never the values themselves.
 */
export const authSetup = query({
  args: {},
  handler: async (ctx) => {
    const clientId =
      process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
    return {
      googleConfigured: Boolean(clientId && clientSecret),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      siteUrlSet: Boolean(process.env.CONVEX_SITE_URL),
      // Whether `convex run` callers carry an auth identity (diagnostics only).
      callerAuthed: Boolean(await ctx.auth.getUserIdentity()),
    };
  },
});
