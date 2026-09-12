import Anthropic from "@anthropic-ai/sdk";
import { Bot, Context, GrammyError } from "grammy";
import { config } from "./config";
import * as db from "./db";
import { ask, formatIdeas } from "./agent";
import { isSilent } from "./prompt";
import { QuotaExhaustedError } from "./providers/gemini";
import { markdownToTelegramHtml, splitMessage } from "./telegramFormat";

export const bot = new Bot(config.telegramToken);

const HELP = `I'm the group's holiday planner. Just talk — I follow the conversation and chime in when it's about the trip, e.g.
"where could 4 of us go for a week in November under €800 each?"

Commands:
/plan <question> – ask me directly
/ideas – the group's saved shortlist
/prefs – show the group profile (home airport, budget, dates…)
/prefs <text> – replace the group profile
/forget – wipe my memory of this chat's conversation (keeps ideas + profile)
/share – create an unlisted web preview of this trip
/status – can I see the whole conversation in this group?
/help – this message

I use the last {n} messages in the chat as context, so you can discuss among yourselves and then ask me.`;

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

/** Remember every text message so the group's discussion is context for later questions. */
function logMessage(ctx: Context, text: string): void {
  const chat = ctx.chat!;
  db.ensureChat(chat.id, chat.type === "private" ? senderName(ctx) : chat.title);
  db.appendMessage(chat.id, {
    role: "user",
    author: senderName(ctx),
    content: text,
    tg_message_id: ctx.message?.message_id ?? null,
  });
}

async function handleQuestion(ctx: Context, question: string): Promise<void> {
  const chatId = ctx.chat!.id;
  db.ensureChat(chatId, ctx.chat!.type === "private" ? senderName(ctx) : ctx.chat!.title);
  const author = senderName(ctx);

  const run = async () => {
    const typing = setInterval(() => void ctx.replyWithChatAction("typing").catch(() => {}), 4000);
    void ctx.replyWithChatAction("typing").catch(() => {});
    try {
      const answer = await ask(chatId, author, question);
      if (!isSilent(answer)) await sendLong(ctx, answer);
    } catch (err) {
      console.error("ask failed", err);
      if (err instanceof QuotaExhaustedError) {
        await ctx.reply("Gemini free-tier quota is used up for today — back tomorrow, or enable billing on the Google project.");
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

/** Message text with any @bot mention stripped. */
function stripMention(ctx: Context, text: string): string {
  return text.replace(new RegExp(`@${ctx.me.username}\\b`, "gi"), "").trim();
}

bot.use(async (ctx, next) => {
  if (!allowed(ctx)) {
    console.warn(`ignoring chat ${ctx.chat?.id} (${ctx.chat?.type}) – not in ALLOWED_CHAT_IDS`);
    return;
  }
  await next();
});

bot.command(["start", "help"], (ctx) =>
  ctx.reply(HELP.replaceAll("{me}", ctx.me.username).replace("{n}", String(config.contextMessages))),
);

// Telegram's privacy mode (default on) hides non-command, non-mention messages from bots
// unless the bot is a group admin. Report which situation we are in.
bot.command("status", async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("Private chat: I see everything you send me.");
  const member = await ctx.getChatMember(ctx.me.id);
  const seesAll = ctx.me.can_read_all_group_messages || member.status === "administrator";
  const stored = db.recentMessages(ctx.chat.id, config.contextMessages).length;
  return ctx.reply(
    seesAll
      ? `✅ I can read all messages here (${ctx.me.can_read_all_group_messages ? "privacy mode off" : "I'm an admin"}). ${stored} recent messages in my context.`
      : `⚠️ I only receive commands, replies to me and mentions in this group — I can't follow the conversation.\nFix: make me a group admin, or in @BotFather run /setprivacy → @${ctx.me.username} → Disable, then remove and re-add me.`,
  );
});

bot.command("plan", async (ctx) => {
  const q = ctx.match.trim();
  if (!q) return ctx.reply("Usage: /plan <what you want advice on>");
  logMessage(ctx, q);
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

bot.command("share", (ctx) => {
  db.ensureChat(ctx.chat.id, ctx.chat.title);
  const token = db.getOrCreateShare(ctx.chat.id);
  return ctx.reply(`Here’s the unlisted trip preview:\n${config.publicAppUrl}/trip/${token}`);
});

// Every text message is stored and goes to the model; it answers with SILENT when the
// message isn't for it (see prompt), and nothing is posted in that case.
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // other commands are handled above
  const text = stripMention(ctx, ctx.message.text);
  if (!text) return;
  logMessage(ctx, text);
  await handleQuestion(ctx, text);
});

bot.catch((err) => console.error("bot error", err.error));
