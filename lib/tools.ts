import { config } from "./config";
import * as db from "./db";
import { getClimate, getForecast } from "./weather";
import { webSearch } from "./search";

/** Provider-neutral tool description; `parameters` is plain JSON Schema. */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export type ToolInput = Record<string, unknown>;

export const tools: ToolSpec[] = [
  {
    name: "web_search",
    description:
      "Search the web (Exa). Returns titles, URLs, dates and relevant excerpts. Use specific queries: route + month + year for flights, city + dates for hotels.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_forecast",
    description:
      "16-day daily weather forecast (min/max °C and rain) for a place. Use a city name (e.g. 'Denpasar' rather than 'Bali'); the result states which place was matched — retry if it is wrong.",
    parameters: {
      type: "object",
      properties: { place: { type: "string", description: "City, e.g. 'Lisbon' or 'Denpasar'" } },
      required: ["place"],
      additionalProperties: false,
    },
  },
  {
    name: "get_climate",
    description:
      "Typical weather in a given month for a place, averaged from the last 3 years of real data. Use for trips more than 2 weeks away.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string" },
        month: { type: "integer", minimum: 1, maximum: 12, description: "1 = January" },
      },
      required: ["place", "month"],
      additionalProperties: false,
    },
  },
  {
    name: "save_idea",
    description: "Add a destination/trip idea to the group's shared list.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name, e.g. 'Lisbon, 7 nights in May'" },
        notes: { type: "string", description: "Key facts: rough cost, weather, why it fits, open questions" },
      },
      required: ["title", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "update_idea",
    description: "Change the status or notes of a saved idea (by id from list_ideas).",
    parameters: {
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
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_preferences",
    description:
      "Replace the stored group profile (home airport, budget, travellers, dates, constraints). Pass the full merged text.",
    parameters: {
      type: "object",
      properties: { preferences: { type: "string" } },
      required: ["preferences"],
      additionalProperties: false,
    },
  },
];

export async function runTool(chatId: number, name: string, input: ToolInput): Promise<string> {
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
