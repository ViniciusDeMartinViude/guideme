import { after } from "next/server";
import type { Update } from "grammy/types";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secret = process.env.WEBHOOK_SECRET?.trim();

/**
 * Telegram webhook. Acknowledge immediately and do the (slow) agent turn after the
 * response is sent — Telegram retries updates that are not answered quickly, and a
 * model call with tool use can take a minute.
 */
export async function POST(req: Request): Promise<Response> {
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  after(async () => {
    try {
      await bot.init();
      await bot.handleUpdate(update);
    } catch (err) {
      console.error("update failed", err);
    }
  });

  return new Response("ok");
}

export async function GET(): Promise<Response> {
  await bot.init();
  const info = await bot.api.getWebhookInfo();
  return Response.json({ bot: bot.botInfo.username, webhook: info });
}
