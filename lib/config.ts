import "dotenv/config";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

const provider = (process.env.BOT_PROVIDER?.trim() || "gemini") as "gemini" | "openrouter";

// Gemini: comma-separated fallback list (free tier is 20 requests/day per model).
const defaultModel = {
  gemini: "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview",
  openrouter: "anthropic/claude-opus-5",
}[provider];

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  provider,
  geminiKey: process.env.GEMINI_API_KEY?.trim() || "",
  openRouterKey: process.env.OPENROUTER_API_KEY?.trim() || "",
  exaKey: required("EXA_API_KEY"),
  model: process.env.BOT_MODEL?.trim() || defaultModel,
  effort: (process.env.BOT_EFFORT?.trim() || "medium") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",
  dbPath: process.env.DB_PATH?.trim() || "./data/bot.sqlite",
  allowedChatIds: (process.env.ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  /** How many past turns (user+assistant) to replay to Claude per request. */
  historyTurns: 30,
};
