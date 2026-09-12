// Long-polling runner: no public URL needed. Removes any webhook first, since Telegram
// refuses getUpdates while a webhook is set.
import { bot } from "../lib/bot";
import { config } from "../lib/config";

console.log(`model=${config.model} effort=${config.effort} db=${config.dbPath}`);
bot.start({
  drop_pending_updates: true,
  onStart: (me) => console.log(`@${me.username} is running (long polling)`),
});
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => void bot.stop());
}
