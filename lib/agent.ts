import { config } from "./config";
import * as db from "./db";
import { askAnthropic } from "./providers/anthropic";
import { askGemini } from "./providers/gemini";
import { askOpenAI } from "./providers/openai";
import type { Turn } from "./providers/types";

export { formatIdeas } from "./tools";

/**
 * One full agent turn for a chat: replays recent history, lets the model call tools
 * until it produces a final answer, persists the exchange, returns the answer text.
 */
export async function ask(chatId: number, author: string, text: string): Promise<string> {
  const history: Turn[] = db.recentMessages(chatId, config.historyTurns).map((m) => ({
    role: m.role,
    text: m.role === "user" && m.author ? `${m.author}: ${m.content}` : m.content,
  }));
  const userText = `${author}: ${text}`;

  const providers = { gemini: askGemini, openai: askOpenAI, openrouter: askAnthropic };
  const raw = await providers[config.provider](chatId, history, userText);

  const answer = raw.trim() || "I ran out of steps before finishing — ask me again more narrowly.";
  db.appendMessage(chatId, { role: "user", author, content: text });
  db.appendMessage(chatId, { role: "assistant", author: null, content: answer });
  return answer;
}
