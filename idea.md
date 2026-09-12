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

## How a question flows

```
Telegram group
  │  "@vamatripbot week in November, warm, ~€800 pp?"
  ▼
Next.js route  POST /api/telegram  (or `npm run poll` without a public URL)
  │  checks the webhook secret, replies 200 at once, continues in after()
  ▼
grammY handler (lib/bot.ts)
  │  stores every text message; queues per chat, shows "typing…"
  ▼
Agent turn (lib/agent.ts)
  │  system prompt + today's date + group profile + saved ideas
  │  + last 30 stored turns + the new message ("Mik: …")
  ▼
Model (Gemini Flash by default; Claude Opus 5 via OpenRouter with BOT_PROVIDER=openrouter)
  │  loops: model → function call → run tool → result → model …
  │
  ├─ web_search      → Exa /search (titles, URLs, dates, excerpts)
  ├─ get_forecast    → Open-Meteo 16-day forecast
  ├─ get_climate     → Open-Meteo archive, last 3 years of that month, averaged
  ├─ save_idea / update_idea / list_ideas → SQLite `ideas`
  └─ update_preferences                   → SQLite `chats.preferences`
  │
  ▼  final text
Markdown → Telegram HTML, split at 4 000 chars, sent as reply
  │
  ▼
SQLite `messages`: user turn + assistant answer stored for next time
```

Each answer typically costs one to four model calls (one per round of tool use).

## Components

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router) | Webhook as a route handler + a dashboard in one codebase |
| Runtime | Node 24 + TypeScript | Built-in `node:sqlite` avoids native modules |
| Telegram | grammY | Small, typed, supports polling and webhooks with the same bot object |
| Model | Gemini 3.x Flash (default) — or Claude Opus 5 via OpenRouter | Same tools either way; provider is one env var. Gemini free tier is 20 req/day/model, so billing is needed for daily use |
| Search | Exa | Semantic search with page excerpts — good for "price of X in month Y" queries |
| Weather | Open-Meteo | Free, no key; has both forecast and historical archive |
| Memory | SQLite (`data/bot.sqlite`) | One file, survives restarts, nothing to host |
| Exposure | Webhook behind ngrok (or a host); `npm run poll` as the no-URL fallback | Webhook fits Next.js; polling needs nothing public |
| Dashboard | `/` and `/chats/[id]`, basic-auth | See what the bot remembers without opening Telegram |

## Running it

```
cp .env.example .env     # fill TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, EXA_API_KEY
npm install
npm run dev              # Next.js on :3000 (dashboard + webhook route)
ngrok http 3000          # public URL → WEBHOOK_URL in .env
npm run webhook:set      # tell Telegram where to POST
```

No public URL handy? `npm run poll` runs the same bot with long polling instead.

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
- **Read the whole chat** — turn Telegram privacy mode off so the bot follows the conversation
  and chimes in when relevant, not only when mentioned (costs more, needs tuning to avoid noise).
- **Polls** — let the bot open a Telegram poll when the group is choosing between shortlisted ideas.
- **Always-on hosting** — move from the WSL machine to a small VPS/Fly.io box; the code already
  runs in either polling or webhook mode.
