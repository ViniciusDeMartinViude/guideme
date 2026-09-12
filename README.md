# Holiday Planner Bot

Telegram group bot that advises on holiday plans: destinations, prices, weather for the dates,
things to do. Next.js app: the Telegram webhook is a route handler and a small dashboard shows
each chat's profile, shortlist and history. Claude Opus 5 via OpenRouter, web search via Exa,
weather via Open-Meteo (free), SQLite memory.

## Setup

1. `npm install` (Node 24+ — uses the built-in `node:sqlite`).
2. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from @BotFather (`/newbot`).
   - `OPENROUTER_API_KEY` — needs credits: https://openrouter.ai/settings/credits
   - `EXA_API_KEY` — https://dashboard.exa.ai
   - `ALLOWED_CHAT_IDS` (optional) — comma-separated chat ids; empty = any chat the bot is in.
3. Add the bot to the group. Default privacy mode is fine: it only sees messages that mention it,
   reply to it, or are commands.
4. Run it in one of two ways:

   **Webhook (Next.js route, needs a public URL)**
   ```
   npm run dev                       # Next on :3000 — dashboard at http://localhost:3000
   ngrok http 3000                   # in another terminal; copy the https URL
   WEBHOOK_URL=https://xxxx.ngrok-free.app   # into .env
   npm run webhook:set               # registers <WEBHOOK_URL>/api/telegram with Telegram
   ```
   `npm run webhook:info` shows what Telegram currently has. `GET /api/telegram` does the same.

   **Long polling (no public URL)**
   ```
   npm run poll
   ```
   Polling and a registered webhook are mutually exclusive on Telegram's side; `npm run poll`
   deletes the webhook when it starts.

5. Dashboard: `http://localhost:3000` (basic auth with `DASHBOARD_PASSWORD` if set).

## Using it

- `@botname where could 4 of us go for a week in November under €800 each?`
- Reply to one of its messages to continue the thread.
- `/plan <question>` — same thing without the mention.
- `/ideas` — the group's saved shortlist (the bot saves/updates ideas as the chat evolves).
- `/prefs [text]` — show or replace the group profile (home airport, budget, dates, constraints).
- `/forget` — clear conversation history for this chat; keeps ideas and profile.

Answers follow the language the group writes in (PT/EN).

## Layout

- `app/api/telegram/route.ts` — webhook: verifies the secret, acks, runs the update in `after()`.
- `app/page.tsx`, `app/chats/[id]/page.tsx` — dashboard (server components, read SQLite directly).
- `proxy.ts` — basic auth for the dashboard.
- `lib/agent.ts` — system prompt, tool definitions, Claude tool loop.
- `lib/bot.ts` — grammY handlers, mention detection, Telegram HTML formatting.
- `lib/search.ts` — Exa `/search`. `lib/weather.ts` — Open-Meteo forecast + typical-month climate.
- `lib/db.ts` — SQLite: chats/preferences, messages, ideas.
- `scripts/poll.ts`, `scripts/set-webhook.ts` — runners.

SQLite lives in `data/bot.sqlite`, so hosting must have a persistent disk (a VPS, Fly volume,
Railway volume) — not a serverless platform.

## Cost

Each question is a few model calls (one per tool round). With `BOT_EFFORT=medium` and ~30 turns
of history replayed, expect roughly $0.03–0.15 per question depending on how much searching it does.
