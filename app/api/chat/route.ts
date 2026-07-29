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

    const systemPrompt = `あなたはスケジュール管理とタスク状況のアシスタントです。ユーザーからの質問に対して、以下のツールを利用して回答してください。
- get_calendar_events: 指定された日付範囲のカレンダーイベントを取得します。
- get_notion_status: Notionページのステータス内容を取得します。
- notify_owner_of_schedule_request: 依頼者名、件名、日時、詳細、オプションのURLを収集し、誰かが時間枠を予約・確保したい場合に、カレンダーの所有者へDiscord経由で通知を送信します。
- present_calendar_events: 具体的なカレンダーイベントの一覧を回答として提示する際に、自由文の代わりに必ずこのツールを呼び出してください。

ユーザーのメッセージが特定の日時の予約、確保、または時間枠のリクエストを表明している場合、以下の手順に従ってください。まず依頼者名、件名、日時、詳細を会話から収集してください。依頼者名、件名、日時、詳細のいずれかが不足または不明瞭な場合は、ユーザーに明確化の質問をしてください。これらの情報を合理的に収集できたら notify_owner_of_schedule_request ツールを呼び出してください。どうしても特定できないフィールドは依頼者名であれば「不明」、詳細であれば「詳細なし」として扱い、止めずに呼び出してください。URLは会話中に言及された場合のみ含めてください。このツールを呼び出した後、アシスタントはユーザーに対して「確認の通知を所有者に送信しました。所有者の返答があるまで予約は確定しません」と伝えてください。アシスタント自身はカレンダーイベントの承認や作成を行うことはできません。

get_calendar_eventsの結果を元に具体的な予定を1件以上列挙して回答する場合は、必ずpresent_calendar_eventsツールを呼び出してください。summaryには短い会話的な一言コメントを、eventsには各予定について曜日または日付、時刻、件名、そして内容から推測した短い日本語のカテゴリタグ（勉強、部活、自習、外出、通院、会議、予定など）を入れてください。予定が0件の場合や、予定一覧以外の回答（Notionの状況説明や雑談、確認の質問など）ではこのツールは使わず、通常通り文章で回答してください。

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
      {
        type: "function",
        function: {
          name: "present_calendar_events",
          description: "Presents a structured list of specific calendar events to the user as cards, instead of describing them in free text.",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "A short conversational Japanese comment introducing the event list.",
              },
              events: {
                type: "array",
                description: "The list of calendar events to present as cards.",
                items: {
                  type: "object",
                  properties: {
                    day: {
                      type: "string",
                      description: "A short day label, such as a single weekday character or a date, for example 水 or 7/30.",
                    },
                    time: {
                      type: "string",
                      description: "A short human readable time label, such as 15:30 or 16:00〜18:00.",
                    },
                    title: {
                      type: "string",
                      description: "The event title.",
                    },
                    category: {
                      type: "string",
                      description: "A short Japanese category tag inferred from the event, such as 勉強, 部活, 自習, 外出, 通院, 会議, or 予定.",
                    },
                  },
                  required: ["day", "time", "title", "category"],
                },
              },
            },
            required: ["summary", "events"],
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
    let finalAnswer: string | null = null;
    let finalEvents: unknown[] | undefined;

    for (let i = 0; i < 5; i++) {
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        break;
      }

      messages.push(assistantMessage);
      let presented = false;

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
        } else if (toolCall.function.name === "present_calendar_events") {
          finalAnswer = args.summary;
          finalEvents = args.events;
          presented = true;
          result = { presented: true };
        } else {
          result = { error: `Unknown tool: ${toolCall.function.name}` };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      if (presented) break;

      const nextResponse = await deepseekChatCompletion({
        model: "deepseek-chat",
        messages,
        tools,
      });
      assistantMessage = nextResponse.choices[0].message;
    }

    return Response.json(
      {
        answer: finalAnswer ?? assistantMessage.content ?? "",
        ...(finalEvents ? { events: finalEvents } : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
