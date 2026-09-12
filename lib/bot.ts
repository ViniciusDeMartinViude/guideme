import Anthropic from "@anthropic-ai/sdk";
import { Bot, Context, GrammyError } from "grammy";
import { config } from "./config";
import * as db from "./db";
import { ask, formatIdeas } from "./agent";
import { QuotaExhaustedError } from "./providers/gemini";
import { markdownToTelegramHtml, splitMessage } from "./telegramFormat";

export const bot = new Bot(config.telegramToken);

const HELP = `I'm the group's holiday planner. Mention me (@{me}) or reply to one of my messages with what you're thinking, e.g.
"@{me} where could 4 of us go for a week in November under €800 each?"

Commands:
/plan <question> – ask without mentioning me
/ideas – the group's saved shortlist
/prefs – show the group profile (home airport, budget, dates…)
/prefs <text> – replace the group profile
/forget – wipe my memory of this chat's conversation (keeps ideas + profile)
/help – this message`;

function senderName(ctx: Context): string {
  const u = ctx.from;
  if (!u) return "someone";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "someone";
}

function allowed(ctx: Context): boolean {
  const id = ctx.chat?.id;
  if (id === undefined) return false;
  return config.allowedChatIds.length === 0 || config.allowedChatIds.includes(id);
}

async function sendLong(ctx: Context, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    try {
      await ctx.reply(markdownToTelegramHtml(chunk), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      // Telegram rejects malformed HTML; fall back to plain text rather than dropping the answer.
      if (err instanceof GrammyError && err.description.includes("can't parse entities")) {
        await ctx.reply(chunk, { link_preview_options: { is_disabled: true } });
      } else {
        throw err;
      }
    }
  }
}

// One in-flight request per chat so history stays ordered.
const queues = new Map<number, Promise<void>>();

async function handleQuestion(ctx: Context, question: string): Promise<void> {
  const chatId = ctx.chat!.id;
  db.ensureChat(chatId, ctx.chat!.type === "private" ? senderName(ctx) : ctx.chat!.title);
  const author = senderName(ctx);

  const run = async () => {
    const typing = setInterval(() => void ctx.replyWithChatAction("typing").catch(() => {}), 4000);
    void ctx.replyWithChatAction("typing").catch(() => {});
    try {
      const answer = await ask(chatId, author, question);
      await sendLong(ctx, answer);
    } catch (err) {
      console.error("ask failed", err);
      if (err instanceof QuotaExhaustedError) {
        await ctx.reply("Daily Gemini free-tier quota reached — I'll be back tomorrow (or enable billing on the Google project).");
      } else if (err instanceof Anthropic.APIError && err.status === 402) {
        await ctx.reply("Out of OpenRouter credits — top up at openrouter.ai/settings/credits and ask again.");
      } else if (err instanceof Anthropic.RateLimitError) {
        await ctx.reply("The model is rate-limited right now — try again in a minute.");
      } else {
        await ctx.reply("Something went wrong on my side — try again in a moment.");
      }
    } finally {
      clearInterval(typing);
    }
  };

  const prev = queues.get(chatId) ?? Promise.resolve();
  const next = prev.then(run, run);
  queues.set(chatId, next);
  await next;
}

/** Text with the @bot mention removed, or undefined if the bot was not addressed. */
function addressedText(ctx: Context): string | undefined {
  const msg = ctx.message;
  if (!msg?.text) return undefined;
  if (ctx.chat?.type === "private") return msg.text;

  const me = ctx.me.username;
  const mentioned = (msg.entities ?? []).some(
    (e) =>
      (e.type === "mention" &&
        msg.text!.slice(e.offset, e.offset + e.length).toLowerCase() === `@${me.toLowerCase()}`) ||
      (e.type === "text_mention" && e.user.id === ctx.me.id),
  );
  const replyToBot = msg.reply_to_message?.from?.id === ctx.me.id;
  if (!mentioned && !replyToBot) return undefined;

  const cleaned = msg.text.replace(new RegExp(`@${me}\\b`, "gi"), "").trim();
  return cleaned || undefined;
}

bot.use(async (ctx, next) => {
  if (!allowed(ctx)) {
    console.warn(`ignoring chat ${ctx.chat?.id} (${ctx.chat?.type}) – not in ALLOWED_CHAT_IDS`);
    return;
  }
  await next();
});

bot.command(["start", "help"], (ctx) =>
  ctx.reply(HELP.replaceAll("{me}", ctx.me.username)),
);

bot.command("plan", async (ctx) => {
  const q = ctx.match.trim();
  if (!q) return ctx.reply("Usage: /plan <what you want advice on>");
  await handleQuestion(ctx, q);
});

bot.command("ideas", (ctx) => {
  db.ensureChat(ctx.chat.id, ctx.chat.title);
  return ctx.reply(formatIdeas(db.listIdeas(ctx.chat.id)));
});

bot.command("prefs", (ctx) => {
  db.ensureChat(ctx.chat.id, ctx.chat.title);
  const text = ctx.match.trim();
  if (text) {
    db.setPreferences(ctx.chat.id, text);
    return ctx.reply("Group profile updated.");
  }
  return ctx.reply(db.getPreferences(ctx.chat.id) || "No group profile yet. Set one with /prefs <text>.");
});

bot.command("forget", (ctx) => {
  db.clearMessages(ctx.chat.id);
  return ctx.reply("Conversation history cleared. Ideas and profile are kept.");
});

bot.on("message:text", async (ctx) => {
  const text = addressedText(ctx);
  if (!text) return;
  await handleQuestion(ctx, text);
});

bot.catch((err) => console.error("bot error", err.error));
