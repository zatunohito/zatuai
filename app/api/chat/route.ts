import { getCalendarEvents } from "../../../lib/tools/calendar";
import { getNotionStatus } from "../../../lib/tools/notion";
import { sendDiscordDm } from "../../../lib/tools/discord";
import {
  deepseekChatCompletion,
  type DeepSeekMessage,
  type DeepSeekTool,
} from "../../../lib/deepseek";

function toGoogleCalendarDate(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarLink(
  title: string,
  startIso: string | undefined,
  endIso: string | undefined,
  details: string
): string | null {
  if (!startIso || !endIso) return null;
  const start = toGoogleCalendarDate(startIso);
  const end = toGoogleCalendarDate(endIso);
  if (!start || !end) return null;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

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
- notify_owner_of_schedule_request: 依頼者名、連絡先、件名、日時（表示用の文章と、可能であればISO 8601形式の開始/終了日時）、詳細、オプションのURLを収集し、誰かが時間枠を予約・確保したい場合に、カレンダーの所有者へDiscord経由で通知を送信します。ISO形式の開始/終了日時が分かる場合は、Googleカレンダーに1クリックで追加できるリンクを自動生成して通知に含めます。
- present_calendar_events: 具体的なカレンダーイベントの一覧を回答として提示する際に、自由文の代わりに必ずこのツールを呼び出してください。
- notify_owner_of_inquiry: 予約や時間枠のリクエストではない、一般的な質問や問い合わせを所有者宛てに正確にまとめ、返信先メールアドレスとともにDiscord経由で通知します。
- present_choices: 選択肢が少数かつ明確な質問をユーザーにする場合に、自由文で尋ねる代わりにボタン形式の選択肢を提示します。

このカレンダーの所有者は次のいずれかの名前で呼ばれることがあります: zatunohito, 大畠朔翔, おおはたさくと, zatu。これらはすべて同じ人物、つまりカレンダー所有者本人を指します。ユーザーがこれらの名前のいずれかで自己紹介した場合は、依頼者が所有者本人であると理解してください。

ユーザーのメッセージが特定の日時の予約、確保、または時間枠のリクエストを表明している場合、以下の手順に従ってください。まず依頼者名、連絡先（メールアドレス、電話番号、メッセージアプリのIDなど、所有者が返信できる手段）、件名、日時、詳細を会話から収集してください。件名や詳細の内容から、会議、ミーティング、MTG、打ち合わせなど、オンライン会議であることが推測される場合は、会議のURL（ZoomやGoogle Meetのリンクなど）がまだ会話に出ていなければ、他の不足情報と同様にユーザーに尋ねてください。依頼者名、連絡先、件名、日時、詳細のいずれかが不足または不明瞭な場合は、ユーザーに明確化の質問をしてください。これらの情報を合理的に収集できたら notify_owner_of_schedule_request ツールを呼び出してください。どうしても特定できないフィールドは依頼者名や連絡先であれば「不明」、詳細であれば「詳細なし」として扱い、止めずに呼び出してください。URLは会話中に言及された場合のみ含めてください。このツールを呼び出した後、アシスタントはユーザーに対して「確認の通知を所有者に送信しました。所有者の返答があるまで予約は確定しません」と伝えてください。アシスタント自身はカレンダーイベントの承認や作成を行うことはできません。

ユーザーのメッセージが予約や時間枠のリクエストではなく、所有者への一般的な質問や問い合わせである場合は、以下の手順に従ってください。まずユーザーの発言内容を正確に読み取り、質問や問い合わせの内容を簡潔かつ正確な日本語で要約してください。次に、所有者が返信できるメールアドレスがまだ会話に出ていなければ、ユーザーに尋ねてください。問い合わせ内容とメールアドレスの両方が揃ったら notify_owner_of_inquiry ツールを呼び出してください。問い合わせ者の名前が分かればそれも含め、分からない場合は「不明」としてください。このツールを呼び出した後、アシスタントはユーザーに対して「問い合わせを所有者に送信しました。返信をお待ちください」と伝えてください。

ユーザーに質問をする際、想定される答えが少数（2〜5個程度）で明確に列挙できる場合は、自由文で尋ねる代わりに present_choices ツールを呼び出して、質問文と選択肢のボタンを提示してください。例えば、はい・いいえで答えられる質問、オンラインか対面かのような二択、あるいは既知の少数の選択肢から選んでもらう質問などが該当します。選択肢は簡潔な日本語のラベルにしてください。答えが自由記述でなければ答えられないもの（名前、日時、詳細な文章など）には使わないでください。

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
              contact: {
                type: "string",
                description: "A way for the owner to reach the requester back, such as an email address, phone number, or messaging app handle, as mentioned in the conversation, or the plain Japanese text 不明 if not mentioned.",
              },
              eventTitle: {
                type: "string",
                description: "A short title or subject for the requested meeting or event.",
              },
              datetime: {
                type: "string",
                description: "A human readable Japanese description of the requested date and time.",
              },
              startDateTime: {
                type: "string",
                description: "The requested start date and time resolved to an absolute ISO 8601 string, for example 2026-08-10T15:00:00+09:00. Resolve relative expressions like tomorrow or next Monday using the current date and time provided in the system prompt. Omit this property entirely if a specific start time truly cannot be determined.",
              },
              endDateTime: {
                type: "string",
                description: "The requested end date and time resolved to an absolute ISO 8601 string, in the same way as startDateTime. Omit this property entirely if a specific end time truly cannot be determined.",
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
            required: ["requesterName", "contact", "eventTitle", "datetime", "details"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "notify_owner_of_inquiry",
          description: "Sends a Discord direct message to the calendar owner summarizing a general question or inquiry from someone, along with a reply-to email address, when the request is not about scheduling a time slot.",
          parameters: {
            type: "object",
            properties: {
              inquirerName: {
                type: "string",
                description: "The name of the person asking, as mentioned in the conversation, or the plain Japanese text 不明 if not mentioned.",
              },
              question: {
                type: "string",
                description: "An accurate, concise Japanese summary of the question or inquiry, faithfully reflecting what the person actually asked.",
              },
              replyEmail: {
                type: "string",
                description: "The email address the owner should reply to, as mentioned in the conversation.",
              },
            },
            required: ["inquirerName", "question", "replyEmail"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "present_choices",
          description: "Presents the user with a short question and a small set of clickable option buttons, instead of asking a free text question, for questions with a limited well defined set of likely answers.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The question or prompt text to show to the user.",
              },
              options: {
                type: "array",
                description: "Two to five short Japanese option labels for the user to choose from.",
                items: {
                  type: "string",
                },
              },
            },
            required: ["message", "options"],
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
    let finalChoices: unknown[] | undefined;

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
            `連絡先: ${args.contact}`,
            `件名: ${args.eventTitle}`,
            `日時: ${args.datetime}`,
            `詳細: ${args.details}`,
          ];
          if (args.url) {
            lines.push(`URL: ${args.url}`);
          }
          const calendarLink = buildGoogleCalendarLink(
            args.eventTitle,
            args.startDateTime,
            args.endDateTime,
            args.details
          );
          if (calendarLink) {
            lines.push(`カレンダーに追加: ${calendarLink}`);
          }
          const formattedMessage = lines.join("\n");
          await sendDiscordDm(formattedMessage);
          result = { notified: true };
        } else if (toolCall.function.name === "notify_owner_of_inquiry") {
          const inquiryMessage = [
            "新しい問い合わせ",
            `問い合わせ者: ${args.inquirerName}`,
            `質問内容: ${args.question}`,
            `返信先メール: ${args.replyEmail}`,
          ].join("\n");
          await sendDiscordDm(inquiryMessage);
          result = { notified: true };
        } else if (toolCall.function.name === "present_calendar_events") {
          finalAnswer = args.summary;
          finalEvents = args.events;
          presented = true;
          result = { presented: true };
        } else if (toolCall.function.name === "present_choices") {
          finalAnswer = args.message;
          finalChoices = args.options;
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
        ...(finalChoices ? { choices: finalChoices } : {}),
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
