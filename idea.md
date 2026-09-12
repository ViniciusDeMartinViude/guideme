# Idea: a holiday-planning advisor living in our Telegram group

## The problem

Planning a trip with friends happens in a group chat: someone throws out "Bali in November?",
someone else asks "how much are flights?", a third person wonders about the weather, and the
thread dies because nobody wants to open ten tabs. The facts (prices, climate, entry rules) are
all public — the missing piece is someone who fetches them, remembers what the group already
decided, and turns it into a recommendation.

## The bot

**@vamatripbot** sits in the group and acts as that person. It follows the whole conversation
and, whenever a message is about the trip (or asks it something), it:

1. reads the message in the context of the last ~20 group messages — everyone's, not only the
   ones aimed at it — and the group's stored profile (home airport, budget, who travels, constraints);
2. decides what it needs — searches the web for current prices/events/visa rules, pulls the
   forecast or the typical weather for the month in question;
3. answers in the group's language with a concrete, sourced recommendation, short enough for a
   phone screen;
4. keeps a shared shortlist of ideas (`/ideas`) that it updates as the group shortlists, rejects,
   or books things, and updates the profile (`/prefs`) whenever it learns a lasting fact.

Greetings and side chatter between people get no reply (the model answers `[silent]` and the bot
posts nothing). For this to work the bot must be a group admin or have Telegram privacy mode off.

## Status

Working since 2026-09-12 in the test group, running on the WSL machine with `npm run poll`
(long polling — the bot calls Telegram, nothing is exposed publicly) and OpenAI `gpt-5.5`.
The Next.js webhook route exists for the day it moves to a server.

## How a message flows

```
Telegram group
  │  "Let's go karting" … "Or Yas parks" … "help us with the holiday plans"
  ▼
`npm run poll` (long polling)          — or POST /api/telegram when hosted (webhook)
  │  the bot must be a group admin (or privacy mode off) to receive every message
  ▼
grammY handler (lib/bot.ts)
  │  stores every text message (deduped by Telegram id); queues per chat; shows "typing…"
  ▼
Agent turn (lib/agent.ts)
  │  system prompt + today's date + group profile + saved ideas
  │  + the last 20 chat messages from everyone (BOT_CONTEXT_MESSAGES) + the new one ("Ana: …")
  ▼
Model (OpenAI gpt-5.5 by default; BOT_PROVIDER=gemini or openrouter swaps it)
  │  loops: model → function call → run tool → result → model …
  │
  ├─ web_search      → Exa /search (titles, URLs, dates, excerpts)
  ├─ get_forecast    → Open-Meteo 16-day forecast
  ├─ get_climate     → Open-Meteo archive, last 3 years of that month, averaged
  ├─ save_idea / update_idea / list_ideas → SQLite `ideas`
  └─ update_preferences                   → SQLite `chats.preferences`
  │
  ▼  final text — or "[silent]" for greetings / side chatter, in which case nothing is posted
Markdown → Telegram HTML, split at 4 000 chars, sent as reply
  │
  ▼
SQLite `messages`: the answer is stored next to the chat log for the next turn
```

Each answer typically costs one to four model calls (one per round of tool use); every
trip-related message triggers a turn, so a chatty group means more calls.

## Components

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) | Webhook as a route handler + a dashboard in one codebase |
| Runtime | Node 24 + TypeScript | Built-in `node:sqlite` avoids native modules |
| Telegram | grammY | Small, typed, supports polling and webhooks with the same bot object |
| Model | OpenAI `gpt-5.5` (default). Alternatives: Gemini 3.x Flash, Claude Opus 5 via OpenRouter | Same tools either way; `BOT_PROVIDER` picks one. OpenAI was the key with working billing; Gemini free tier is 20 req/day/model (the bot rotates through several Flash models); OpenRouter needs credits. `gpt-5.4-mini` if cost matters |
| Search | Exa | Semantic search with page excerpts — good for "price of X in month Y" queries |
| Weather | Open-Meteo | Free, no key; has both forecast and historical archive |
| Memory | SQLite (`data/bot.sqlite`) | One file, survives restarts, nothing to host |
| Exposure | `npm run poll` (long polling) on the WSL machine; webhook route for a future server | Polling needs no public URL or ngrok; the webhook is there for hosting |
| Dashboard | `/` and `/chats/[id]`, basic-auth | See what the bot remembers without opening Telegram |

## Running it

```
cp .env.example .env     # fill TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, EXA_API_KEY
npm install
npm run poll             # the bot (long polling)
npm run dev              # optional dashboard at http://localhost:3000
```

In Telegram: add the bot to the group and make it an **admin** (or `/setprivacy` → Disable in
@BotFather, then remove and re-add it); `/status` in the group confirms it sees everything.

On a server later: `npm run build && npm start`, set `WEBHOOK_URL`, `npm run webhook:set`.

## Commands

| Command | Effect |
|---|---|
| any message | stored as context; answered when it's about the trip |
| `/plan <question>` | ask directly |
| `/status` | can the bot see the whole conversation here? |
| `/ideas` | show the shortlist |
| `/prefs [text]` | show or replace the group profile |
| `/forget` | clear conversation memory (keeps ideas + profile) |
| `/help` | usage |

## Where it could go next

- **Live fares** — replace web-search estimates with a flight/hotel API (Amadeus, Kiwi) when the
  group wants to book rather than browse.
- **Proactive mode** — a scheduled run that watches a shortlisted idea and posts when fares drop
  or a deadline (visa, school holidays) approaches.
- **Tune when it speaks** — it now follows everything and stays quiet on chit-chat; if it turns
  out too talkative (or too quiet), the rule lives in one paragraph of `lib/prompt.ts`.
- **Polls** — let the bot open a Telegram poll when the group is choosing between shortlisted ideas.
- **Always-on hosting** — move from the WSL machine to a small VPS/Fly.io box; the code already
  runs in either polling or webhook mode.
