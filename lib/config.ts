import "dotenv/config";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  openRouterKey: required("OPENROUTER_API_KEY"),
  exaKey: required("EXA_API_KEY"),
  model: process.env.BOT_MODEL?.trim() || "anthropic/claude-opus-5",
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
