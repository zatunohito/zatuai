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

  const res = await fetch(`${BASE_URL}/chat/completions`, {
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
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`DeepSeek API error ${res.status}: ${text}`);
    throw new Error("DeepSeek API error");
  }

  return res.json() as Promise<{
    choices: Array<{ message: DeepSeekMessage; finish_reason: string }>;
  }>;
}
