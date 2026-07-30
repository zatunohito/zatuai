const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = "https://api.deepseek.com";

export type DeepSeekTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

// Caps a single completion call so a stalled upstream request fails with a
// clear error instead of leaving the user staring at a spinner indefinitely.
const REQUEST_TIMEOUT_MS = 120_000;

export async function deepseekChatCompletion(params: {
  model: string;
  messages: DeepSeekMessage[];
  tools?: DeepSeekTool[];
  temperature?: number;
  max_tokens?: number;
  reasoningEffort?: "high" | "max";
}) {
  if (!API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        ...(params.reasoningEffort
          ? { reasoning_effort: params.reasoningEffort, thinking: { type: "enabled" } }
          : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error(`DeepSeek API timed out after ${REQUEST_TIMEOUT_MS}ms`);
      throw new Error("DeepSeek API timeout");
    }
    throw error;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`DeepSeek API error ${res.status}: ${text}`);
    throw new Error("DeepSeek API error");
  }

  return res.json() as Promise<{
    choices: Array<{ message: DeepSeekMessage; finish_reason: string }>;
  }>;
}

type StreamDelta = {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

// Same contract as deepseekChatCompletion, but consumes DeepSeek's own SSE
// stream so plain-text answers can be shown to the user as they're generated
// instead of only after the whole completion finishes. Tool-call turns don't
// produce meaningful content deltas (the arguments stream separately as
// partial JSON, which onContentDelta never sees), so this is a safe drop-in
// for both cases.
export async function deepseekChatCompletionStream(
  params: {
    model: string;
    messages: DeepSeekMessage[];
    tools?: DeepSeekTool[];
    temperature?: number;
    max_tokens?: number;
    reasoningEffort?: "high" | "max";
  },
  onContentDelta?: (text: string) => void
): Promise<{ choices: Array<{ message: DeepSeekMessage; finish_reason: string }> }> {
  if (!API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        stream: true,
        ...(params.reasoningEffort
          ? { reasoning_effort: params.reasoningEffort, thinking: { type: "enabled" } }
          : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error(`DeepSeek API timed out after ${REQUEST_TIMEOUT_MS}ms`);
      throw new Error("DeepSeek API timeout");
    }
    throw error;
  }

  if (!res.ok || !res.body) {
    const text = res.body ? await res.text() : "";
    console.error(`DeepSeek API error ${res.status}: ${text}`);
    throw new Error("DeepSeek API error");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let role = "assistant";
  let finishReason = "stop";
  const toolCallsByIndex = new Map<
    number,
    { id: string; type: "function"; function: { name: string; arguments: string } }
  >();

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;

      let json: { choices?: Array<{ delta?: StreamDelta; finish_reason?: string | null }> };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};

      if (typeof delta.role === "string") role = delta.role;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        onContentDelta?.(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = toolCallsByIndex.get(idx);
          if (existing) {
            existing.function.arguments += tc.function?.arguments ?? "";
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.id) existing.id = tc.id;
          } else {
            toolCallsByIndex.set(idx, {
              id: tc.id ?? `call_${idx}`,
              type: "function",
              function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
            });
          }
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value);

  const message: DeepSeekMessage = {
    role: role as DeepSeekMessage["role"],
    content: content || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  return { choices: [{ message, finish_reason: finishReason }] };
}
