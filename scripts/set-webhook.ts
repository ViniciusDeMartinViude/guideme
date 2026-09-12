// Register (or inspect) the Telegram webhook for the Next.js route.
//   npm run webhook:set      -> setWebhook(WEBHOOK_URL + /api/telegram)
//   npm run webhook:info     -> getWebhookInfo
import { bot } from "../lib/bot";

const base = process.env.WEBHOOK_URL?.trim().replace(/\/$/, "");
const secret = process.env.WEBHOOK_SECRET?.trim() || undefined;

await bot.init();
if (process.argv.includes("--info")) {
  console.log(await bot.api.getWebhookInfo());
} else {
  if (!base) throw new Error("WEBHOOK_URL is not set in .env");
  await bot.api.setWebhook(`${base}/api/telegram`, { secret_token: secret, drop_pending_updates: true });
  console.log(`@${bot.botInfo.username} webhook -> ${base}/api/telegram`);
}
