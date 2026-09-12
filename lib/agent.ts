import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import * as db from "./db";
import { getClimate, getForecast } from "./weather";
import { webSearch } from "./search";

// OpenRouter exposes an Anthropic-compatible Messages endpoint, so the official SDK
// works unchanged with a different base URL. Server-side Anthropic tools (web_search)
// are not available through it, hence the Exa-backed web_search tool below.
const client = new Anthropic({ apiKey: config.openRouterKey, baseURL: "https://openrouter.ai/api" });

const SYSTEM = `You are the holiday-planning advisor for a small group of friends/family chatting on Telegram.
Your job: suggest and compare destinations and trip plans, weighing price, travel time, weather for the
dates, things to do, food, safety and visa/entry rules. Be concrete: name places, neighbourhoods, seasons,
rough price ranges, and always say where a number comes from (web search result vs. your estimate).

Tools:
- web_search: current prices (flights, hotels, packages), events, entry rules, anything time-sensitive.
  Prefer it over guessing when money or dates are involved. Quote the price with its date, currency
  and source site. You may call it several times with different queries; keep it to what you need.
- get_forecast: next 16 days of actual forecast for a place.
- get_climate: typical weather for a given month (from recent years of real data). Use it whenever
  a trip is more than two weeks away.
- save_idea / update_idea / list_ideas: the group's shared shortlist. Save an idea when the group
  seems interested in it or explicitly asks; update its status when they shortlist, reject, or book it.
- update_preferences: when the group states a lasting fact about themselves (home airport, budget,
  dates, who is travelling, dislikes), record it so you do not have to ask again. Merge into the
  existing text; do not drop earlier facts.

Style for Telegram:
- Reply in the language the group is writing in (Portuguese or English).
- Short paragraphs, bullet lists, no tables, no headings larger than bold text. Keep replies under
  ~300 words unless a detailed comparison was asked for.
- If a key fact is missing (dates, budget, home city) and it changes the answer, ask one short
  question instead of guessing — but still give a preliminary answer if you can.
- Several people are talking; messages are prefixed with the sender's name. Address people by name
  when it helps.`;

type ToolInput = Record<string, unknown>;

const customTools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web (Exa). Returns titles, URLs, dates and relevant excerpts. Use specific queries: route + month + year for flights, city + dates for hotels.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_forecast",
    description:
      "16-day daily weather forecast (min/max °C and rain) for a place. Use a city name (e.g. 'Denpasar' rather than 'Bali'); the result states which place was matched — retry if it is wrong.",
    input_schema: {
      type: "object",
      properties: { place: { type: "string", description: "City, e.g. 'Lisbon' or 'Denpasar'" } },
      required: ["place"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_climate",
    description:
      "Typical weather in a given month for a place, averaged from the last 3 years of real data. Use for trips more than 2 weeks away.",
    input_schema: {
      type: "object",
      properties: {
        place: { type: "string" },
        month: { type: "integer", minimum: 1, maximum: 12, description: "1 = January" },
      },
      required: ["place", "month"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "save_idea",
    description: "Add a destination/trip idea to the group's shared list.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, e.g. 'Lisbon, 7 nights in May'" },
        notes: { type: "string", description: "Key facts: rough cost, weather, why it fits, open questions" },
      },
      required: ["title", "notes"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "update_idea",
    description: "Change the status or notes of a saved idea (by id from list_ideas).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        status: { type: "string", enum: ["open", "shortlisted", "rejected", "booked"] },
        notes: { type: "string", description: "Replacement notes (omit to keep)" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_ideas",
    description: "List the group's saved trip ideas with ids and statuses.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "update_preferences",
    description:
      "Replace the stored group profile (home airport, budget, travellers, dates, constraints). Pass the full merged text.",
    input_schema: {
      type: "object",
      properties: { preferences: { type: "string" } },
      required: ["preferences"],
      additionalProperties: false,
    },
    strict: true,
  },
];

async function runTool(chatId: number, name: string, input: ToolInput): Promise<string> {
  switch (name) {
    case "web_search":
      return webSearch(String(input.query), config.exaKey);
    case "get_forecast":
      return getForecast(String(input.place));
    case "get_climate":
      return getClimate(String(input.place), Number(input.month));
    case "save_idea": {
      const idea = db.saveIdea(chatId, String(input.title), String(input.notes ?? ""));
      return `Saved idea #${idea.id}: ${idea.title}`;
    }
    case "update_idea": {
      const idea = db.updateIdea(chatId, Number(input.id), {
        status: input.status as db.Idea["status"] | undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      });
      return idea ? `Updated #${idea.id}: ${idea.title} [${idea.status}]` : `No idea with id ${input.id}`;
    }
    case "list_ideas":
      return formatIdeas(db.listIdeas(chatId, true));
    case "update_preferences":
      db.setPreferences(chatId, String(input.preferences));
      return "Preferences updated.";
    default:
      return `Unknown tool ${name}`;
  }
}

export function formatIdeas(ideas: db.Idea[]): string {
  if (!ideas.length) return "No saved ideas yet.";
  return ideas
    .map((i) => `#${i.id} [${i.status}] ${i.title}${i.notes ? `\n   ${i.notes}` : ""}`)
    .join("\n");
}

function buildContext(chatId: number): string {
  const prefs = db.getPreferences(chatId) || "(nothing recorded yet)";
  const ideas = formatIdeas(db.listIdeas(chatId));
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.\n\nGroup profile:\n${prefs}\n\nSaved ideas:\n${ideas}`;
}

/**
 * One full agent turn for a chat: replays recent history, lets Claude call tools
 * until it produces a final answer, persists the exchange, returns the answer text.
 */
export async function ask(chatId: number, author: string, text: string): Promise<string> {
  const history = db.recentMessages(chatId, config.historyTurns);
  const userText = `${author}: ${text}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map<Anthropic.MessageParam>((m) => ({
      role: m.role,
      content: m.role === "user" && m.author ? `${m.author}: ${m.content}` : m.content,
    })),
    { role: "user", content: userText },
  ];

  const finalText: string[] = [];
  for (let i = 0; i < 12; i++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: config.effort },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: buildContext(chatId) },
      ],
      tools: customTools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return "I can't help with that one.";
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
      for (const b of response.content) if (b.type === "text") finalText.push(b.text);
      break;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      let content: string;
      let isError = false;
      try {
        content = await runTool(chatId, t.name, t.input as ToolInput);
      } catch (err) {
        content = err instanceof Error ? err.message : String(err);
        isError = true;
      }
      results.push({ type: "tool_result", tool_use_id: t.id, content, is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }

  const answer = finalText.join("\n").trim() || "I ran out of steps before finishing — ask me again more narrowly.";
  db.appendMessage(chatId, { role: "user", author, content: text });
  db.appendMessage(chatId, { role: "assistant", author: null, content: answer });
  return answer;
}
