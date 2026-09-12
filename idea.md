# Idea: a holiday-planning advisor living in our Telegram group

## The problem

Planning a trip with friends happens in a group chat: someone throws out "Bali in November?",
someone else asks "how much are flights?", a third person wonders about the weather, and the
thread dies because nobody wants to open ten tabs. The facts (prices, climate, entry rules) are
all public — the missing piece is someone who fetches them, remembers what the group already
decided, and turns it into a recommendation.

## The bot

**@vamatripbot** sits in the group and acts as that person. Mention it or reply to it and it:

1. reads the question in the context of the last ~30 messages exchanged with it and the group's
   stored profile (home airport, budget, who travels, constraints);
2. decides what it needs — searches the web for current prices/events/visa rules, pulls the
   forecast or the typical weather for the month in question;
3. answers in the group's language with a concrete, sourced recommendation, short enough for a
   phone screen;
4. keeps a shared shortlist of ideas (`/ideas`) that it updates as the group shortlists, rejects,
   or books things, and updates the profile (`/prefs`) whenever it learns a lasting fact.

It only speaks when addressed, so it doesn't pollute the chat, and Telegram's default privacy
mode means it never sees messages that aren't for it.

## How a question flows

```
Telegram group
  │  "@vamatripbot week in November, warm, ~€800 pp?"
  ▼
Next.js route  POST /api/telegram  (or `npm run poll` without a public URL)
  │  checks the webhook secret, replies 200 at once, continues in after()
  ▼
grammY handler (lib/bot.ts)
  │  checks mention / reply-to-bot / command
  │  queues per chat, shows "typing…"
  ▼
Agent turn (lib/agent.ts)
  │  system prompt + today's date + group profile + saved ideas
  │  + last 30 stored turns + the new message ("Mik: …")
  ▼
Claude Opus 5 via OpenRouter (Anthropic-compatible endpoint, official SDK)
  │  loops: model → tool_use → run tool → tool_result → model …
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
| Model | Claude Opus 5, adaptive thinking, effort `medium` | Good judgement on trade-offs; medium effort keeps chat replies fast and cheap |
| Provider | OpenRouter | Key we already had; its Anthropic-compatible endpoint lets us keep the official SDK |
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
| `@vamatripbot …` / reply to it | ask anything |
| `/plan <question>` | ask without mentioning |
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
