import { getCalendarEvents } from "../../../lib/tools/calendar";
import { getNotionStatus } from "../../../lib/tools/notion";
import { sendDiscordDm } from "../../../lib/tools/discord";
import {
  deepseekChatCompletion,
  type DeepSeekMessage,
  type DeepSeekTool,
} from "../../../lib/deepseek";

export async function POST(request: Request) {
  try {
    let body: { messages?: Array<{ role: "user" | "assistant"; content: string }> };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { messages: incomingMessages } = body;
    if (
      !incomingMessages ||
      !Array.isArray(incomingMessages) ||
      incomingMessages.length === 0 ||
      incomingMessages[incomingMessages.length - 1].role !== "user" ||
      typeof incomingMessages[incomingMessages.length - 1].content !== "string" ||
      incomingMessages[incomingMessages.length - 1].content.trim() === ""
    ) {
      return Response.json(
        { error: "messages must be a non-empty array whose last entry is a user message with non-empty content" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const systemPrompt = `あなたはスケジュール管理とタスク状況のアシスタントです。ユーザーからの質問に対して、以下の3つのツールを利用して回答してください。
- get_calendar_events: 指定された日付範囲のカレンダーイベントを取得します。
- get_notion_status: Notionページのステータス内容を取得します。
- notify_owner_of_schedule_request: 依頼者名、件名、日時、詳細、オプションのURLを収集し、誰かが時間枠を予約・確保したい場合に、カレンダーの所有者へDiscord経由で通知を送信します。

ユーザーのメッセージが特定の日時の予約、確保、または時間枠のリクエストを表明している場合、以下の手順に従ってください。まず依頼者名、件名、日時、詳細を会話から収集してください。依頼者名、件名、日時、詳細のいずれかが不足または不明瞭な場合は、ユーザーに明確化の質問をしてください。これらの情報を合理的に収集できたら notify_owner_of_schedule_request ツールを呼び出してください。どうしても特定できないフィールドは依頼者名であれば「不明」、詳細であれば「詳細なし」として扱い、止めずに呼び出してください。URLは会話中に言及された場合のみ含めてください。このツールを呼び出した後、アシスタントはユーザーに対して「確認の通知を所有者に送信しました。所有者の返答があるまで予約は確定しません」と伝えてください。アシスタント自身はカレンダーイベントの承認や作成を行うことはできません。

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
      {
        type: "function",
        function: {
          name: "notify_owner_of_schedule_request",
          description: "Collects requester name, event title, date and time, details, and an optional URL before notifying the calendar owner via Discord direct message about a requested time slot so the owner can approve it manually.",
          parameters: {
            type: "object",
            properties: {
              requesterName: {
                type: "string",
                description: "The name of the person requesting the schedule, as mentioned in the conversation, or the plain Japanese text 不明 if not mentioned.",
              },
              eventTitle: {
                type: "string",
                description: "A short title or subject for the requested meeting or event.",
              },
              datetime: {
                type: "string",
                description: "A human readable Japanese description of the requested date and time.",
              },
              details: {
                type: "string",
                description: "A Japanese description of the purpose or additional details of the request, or the plain Japanese text 詳細なし if nothing more was mentioned.",
              },
              url: {
                type: "string",
                description: "An optional related link such as a video call link or reference page, mentioned in the conversation. Omit this property entirely if no URL was mentioned.",
              },
            },
            required: ["requesterName", "eventTitle", "datetime", "details"],
          },
        },
      },
    ];

    const messages: DeepSeekMessage[] = [
      { role: "system", content: systemPrompt },
      ...incomingMessages.map((m) => ({ role: m.role, content: m.content })),
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
        } else if (toolCall.function.name === "notify_owner_of_schedule_request") {
          const lines = [
            "新しい予約リクエスト",
            `依頼者: ${args.requesterName}`,
            `件名: ${args.eventTitle}`,
            `日時: ${args.datetime}`,
            `詳細: ${args.details}`,
          ];
          if (args.url) {
            lines.push(`URL: ${args.url}`);
          }
          const formattedMessage = lines.join("\n");
          await sendDiscordDm(formattedMessage);
          result = { notified: true };
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
