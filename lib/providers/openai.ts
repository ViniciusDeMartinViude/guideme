import OpenAI from "openai";
import type { FunctionTool, ResponseInput } from "openai/resources/responses/responses";
import { config } from "../config";
import { SYSTEM, buildContext } from "../prompt";
import { runTool, tools, type ToolInput } from "../tools";
import type { Turn } from "./types";

let client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!client) {
    if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey: config.openAiKey });
  }
  return client;
}

const functionTools: FunctionTool[] = tools.map((t) => ({
  type: "function",
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  strict: false,
}));

const reasoningEffort = { low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" }[
  config.effort
] as "low" | "medium" | "high";

export async function askOpenAI(chatId: number, history: Turn[], userText: string): Promise<string> {
  let input: ResponseInput = [
    ...history.map((m) => ({ role: m.role, content: m.text }) as const),
    { role: "user", content: userText },
  ];
  let previousResponseId: string | undefined;

  for (let i = 0; i < 12; i++) {
    // Chain on previous_response_id so OpenAI keeps the tool-call context server-side;
    // each follow-up request only carries the new function outputs.
    const response = await getClient().responses.create({
      model: config.model,
      instructions: `${SYSTEM}\n\n${buildContext(chatId)}`,
      input,
      previous_response_id: previousResponseId,
      tools: functionTools,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: 8000,
    });

    const calls = response.output.filter((o) => o.type === "function_call");
    if (calls.length === 0) return response.output_text;

    previousResponseId = response.id;
    input = [];
    for (const call of calls) {
      let output: string;
      try {
        output = await runTool(chatId, call.name, JSON.parse(call.arguments) as ToolInput);
      } catch (err) {
        output = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output });
    }
  }
  return "";
}
