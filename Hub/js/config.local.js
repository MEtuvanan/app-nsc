// LOCAL DEVELOPMENT ONLY.
// Add your own Groq key below to test the AI planner without the edge function.
// Never commit this file. It is listed in .gitignore.
// For production the edge function (supabase/functions/ai-trip-planner/) is used instead.
// A real API key embedded in frontend JavaScript is visible to every browser user.

export const AI_CONFIG = {
  provider: 'groq',
  apiKey: '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',
  model: 'openai/gpt-oss-120b',
};
