import { config } from "./config";
import * as db from "./db";
import { askAnthropic } from "./providers/anthropic";
import { askGemini } from "./providers/gemini";
import { askOpenAI } from "./providers/openai";
import type { Turn } from "./providers/types";
import { isSilent } from "./prompt";

export { formatIdeas } from "./tools";

/**
 * One full agent turn for a chat. Every group message is already stored by the bot layer
 * (addressed to the bot or not); the last `contextMessages` of them are the context, the
 * newest one is the request. Lets the model call tools until it produces a final answer,
 * stores that answer, returns it.
 */
export async function ask(chatId: number, author: string, text: string): Promise<string> {
  const recent = db.recentMessages(chatId, config.contextMessages + 1);
  const last = recent[recent.length - 1];
  // The request should be the newest stored message; fall back to a synthetic turn if not.
  const isStored = last?.role === "user" && last.content === text;
  const history: Turn[] = (isStored ? recent.slice(0, -1) : recent).map((m) => ({
    role: m.role,
    text: m.role === "user" && m.author ? `${m.author}: ${m.content}` : m.content,
  }));
  const userText = `${author}: ${text}`;

  const providers = { gemini: askGemini, openai: askOpenAI, openrouter: askAnthropic };
  const raw = await providers[config.provider](chatId, history, userText);

  const answer = raw.trim() || "I ran out of steps before finishing — ask me again more narrowly.";
  if (!isStored) db.appendMessage(chatId, { role: "user", author, content: text });
  // A silent turn is not part of the conversation.
  if (!isSilent(answer)) db.appendMessage(chatId, { role: "assistant", author: null, content: answer });
  return answer;
}
