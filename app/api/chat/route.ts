import { getCalendarEvents } from "../../../lib/tools/calendar";
import { getNotionStatus } from "../../../lib/tools/notion";
import {
  deepseekChatCompletion,
  type DeepSeekMessage,
  type DeepSeekTool,
} from "../../../lib/deepseek";

export async function POST(request: Request) {
  try {
    let body: { message?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { message } = body;
    if (!message || message.trim() === "") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const systemPrompt = `あなたはスケジュール管理とタスク状況のアシスタントです。ユーザーからの質問に対して、以下の2つのツールを利用して回答してください。
- get_calendar_events: 指定された日付範囲のカレンダーイベントを取得します。
- get_notion_status: Notionページのステータス内容を取得します。

現在の日時: ${nowIso}`;

    const tools: DeepSeekTool[] = [
      {
        type: "function",
        function: {
          name: "get_calendar_events",
          description: "Fetches calendar events for a given date range.",
          parameters: {
            type: "object",
            properties: {
              start: {
                type: "string",
                description: "ISO 8601 date string",
              },
              end: {
                type: "string",
                description: "ISO 8601 date string",
              },
            },
            required: ["start", "end"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_notion_status",
          description: "Fetches the status content of a fixed Notion page.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
    ];

    const messages: DeepSeekMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const initialResponse = await deepseekChatCompletion({
      model: "deepseek-chat",
      messages,
      tools,
    });
    let assistantMessage = initialResponse.choices[0].message;

    for (let i = 0; i < 5; i++) {
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        break;
      }

      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result: unknown;

        if (toolCall.function.name === "get_calendar_events") {
          result = await getCalendarEvents(args.start, args.end);
        } else if (toolCall.function.name === "get_notion_status") {
          result = await getNotionStatus();
        } else {
          result = { error: `Unknown tool: ${toolCall.function.name}` };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      const nextResponse = await deepseekChatCompletion({
        model: "deepseek-chat",
        messages,
        tools,
      });
      assistantMessage = nextResponse.choices[0].message;
    }

    return Response.json(
      { answer: assistantMessage.content ?? "" },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
