import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { config } from "../config";
import { SYSTEM, buildContext } from "../prompt";
import { runTool, tools, type ToolInput } from "../tools";
import type { Turn } from "./types";

let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (!client) {
    if (!config.geminiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey: config.geminiKey });
  }
  return client;
}

// Gemini takes standard JSON Schema via parametersJsonSchema; additionalProperties is not
// part of its OpenAPI subset, so drop it.
const functionDeclarations: FunctionDeclaration[] = tools.map((t) => {
  const { additionalProperties: _drop, ...schema } = t.parameters;
  void _drop;
  return { name: t.name, description: t.description, parametersJsonSchema: schema };
});

// Gemini 3 thinking levels; effort above "high" has no equivalent.
const thinkingLevel = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.HIGH,
  max: ThinkingLevel.HIGH,
}[config.effort];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class QuotaExhaustedError extends Error {}

/** Free-tier Gemini returns 429/503 fairly often; retry a few times with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      // A per-day quota will not clear by waiting; surface it instead of burning retries.
      if (err instanceof ApiError && err.status === 429 && /PerDay/.test(err.message)) {
        throw new QuotaExhaustedError(`Gemini daily free-tier quota reached for ${config.model}`);
      }
      const retryable = err instanceof ApiError && (err.status === 429 || err.status === 503);
      if (!retryable || i >= attempts - 1) throw err;
      const delay = 2000 * 2 ** i;
      console.warn(`gemini ${err.status}, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

export async function askGemini(chatId: number, history: Turn[], userText: string): Promise<string> {
  const contents: Content[] = [
    ...history.map<Content>((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: userText }] },
  ];

  for (let i = 0; i < 12; i++) {
    const response = await withRetry(() =>
      getClient().models.generateContent({
        model: config.model,
        contents,
        config: {
          systemInstruction: `${SYSTEM}\n\n${buildContext(chatId)}`,
          tools: [{ functionDeclarations }],
          thinkingConfig: { thinkingLevel },
          maxOutputTokens: 8000,
        },
      }),
    );

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    contents.push({ role: "model", parts });

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      const text = parts
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("\n")
        .trim();
      if (!text && candidate?.finishReason && candidate.finishReason !== "STOP") {
        return `I couldn't answer that (${candidate.finishReason}).`;
      }
      return text;
    }

    const responses: Part[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      let result: string;
      try {
        result = await runTool(chatId, fc.name ?? "", (fc.args ?? {}) as ToolInput);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      responses.push({ functionResponse: { id: fc.id, name: fc.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return "";
}
