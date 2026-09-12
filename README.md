# Holiday Planner Bot

Telegram group bot that advises on holiday plans: destinations, prices, weather for the dates,
things to do. Next.js app: the Telegram webhook is a route handler and a small dashboard shows
each chat's profile, shortlist and history. Gemini (default) or Claude via OpenRouter, web
search via Exa, weather via Open-Meteo (free), SQLite memory.

## Setup

1. `npm install` (Node 24+ — uses the built-in `node:sqlite`).
2. Copy `.env.example` to `.env` and fill in:
   - `TELEGRAM_BOT_TOKEN` — from @BotFather (`/newbot`).
   - `GEMINI_API_KEY` — https://aistudio.google.com (default provider). Free tier is **20 requests
     per day per model**; a question uses 2–5 requests, so enable billing for real use.
   - `OPENAI_API_KEY` — if `BOT_PROVIDER=openai` (default model `gpt-5.5`; `gpt-5.4-mini` is the cheap option).
   - `OPENROUTER_API_KEY` — if `BOT_PROVIDER=openrouter`; needs credits.
   - `EXA_API_KEY` — https://dashboard.exa.ai
   - `ALLOWED_CHAT_IDS` (optional) — comma-separated chat ids; empty = any chat the bot is in.
3. Add the bot to the group. Default privacy mode is fine: it only sees messages that mention it,
   reply to it, or are commands.
4. Run it:

   **On your own machine — long polling (default, no public URL needed)**
   ```
   npm run poll        # the bot
   npm run dev         # optional: dashboard at http://localhost:3000
   ```

   **On a server — webhook (Next.js route)**
   ```
   npm run build && npm start        # Next on :3000 behind your https domain
   WEBHOOK_URL=https://your.domain   # into .env
   npm run webhook:set               # registers <WEBHOOK_URL>/api/telegram with Telegram
   ```
   `npm run webhook:info` shows what Telegram currently has. Polling and a registered webhook are
   mutually exclusive on Telegram's side; `npm run poll` deletes the webhook when it starts.

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
- `lib/agent.ts` — one turn: load history, call the provider, persist. `lib/prompt.ts` — system prompt.
- `lib/tools.ts` — provider-neutral tool specs (JSON Schema) + `runTool`.
- `lib/providers/gemini.ts`, `openai.ts`, `anthropic.ts` — the model loops (function calling until a final answer).
- `lib/bot.ts` — grammY handlers, mention detection, Telegram HTML formatting.
- `lib/search.ts` — Exa `/search`. `lib/weather.ts` — Open-Meteo forecast + typical-month climate.
- `lib/db.ts` — SQLite: chats/preferences, messages, ideas.
- `scripts/poll.ts`, `scripts/set-webhook.ts` — runners.

SQLite lives in `data/bot.sqlite`, so hosting must have a persistent disk (a VPS, Fly volume,
Railway volume) — not a serverless platform.

## Cost

Each question is a few model calls (one per tool round). Gemini Flash: fractions of a cent per
question on a billed project. Claude Opus 5 via OpenRouter: roughly $0.03–0.15 per question.
