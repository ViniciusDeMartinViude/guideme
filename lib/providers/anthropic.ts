import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { SYSTEM, buildContext } from "../prompt";
import { runTool, tools, type ToolInput } from "../tools";
import type { Turn } from "./types";

// OpenRouter exposes an Anthropic-compatible Messages endpoint, so the official SDK
// works unchanged with a different base URL. Anthropic's server-side web_search is not
// available through it, hence the Exa-backed web_search tool.
let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    if (!config.openRouterKey) throw new Error("OPENROUTER_API_KEY is not set");
    client = new Anthropic({ apiKey: config.openRouterKey, baseURL: "https://openrouter.ai/api" });
  }
  return client;
}

const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
  strict: true,
}));

export async function askAnthropic(chatId: number, history: Turn[], userText: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map<Anthropic.MessageParam>((m) => ({ role: m.role, content: m.text })),
    { role: "user", content: userText },
  ];
  const finalText: string[] = [];

  for (let i = 0; i < 12; i++) {
    const response = await getClient().messages.create({
      model: config.model,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: config.effort },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: buildContext(chatId) },
      ],
      tools: anthropicTools,
      messages,
    });

    if (response.stop_reason === "refusal") return "I can't help with that one.";
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
  return finalText.join("\n").trim();
}
