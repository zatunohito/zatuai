import { getCalendarEvents, type CalendarEvent } from "../../../lib/tools/calendar";

const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"];

const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["会議", "MTG", "ミーティング", "打ち合わせ"], category: "会議" },
  { keywords: ["勉強", "テスト", "試験", "課題"], category: "勉強" },
  { keywords: ["部活", "クラブ"], category: "部活" },
  { keywords: ["自習"], category: "自習" },
  { keywords: ["通院", "病院", "歯科"], category: "通院" },
  { keywords: ["外出", "買い物", "旅行"], category: "外出" },
];

function categorize(title: string): string {
  const lowerTitle = title.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => lowerTitle.includes(keyword.toLowerCase()))) {
      return rule.category;
    }
  }
  return "予定";
}

function formatDayAndTime(startIso: string, endIso: string): { day: string; time: string } {
  const hasTime = startIso.includes("T");
  const start = new Date(startIso);

  if (!hasTime) {
    return { day: `${start.getMonth() + 1}/${start.getDate()}`, time: "終日" };
  }

  const end = new Date(endIso);
  const day = WEEKDAY_KANJI[start.getDay()];
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { day, time: `${formatTime(start)}〜${formatTime(end)}` };
}

export async function GET() {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = await getCalendarEvents(now.toISOString(), end.toISOString());

    const upcoming = events
      .filter((event) => !Number.isNaN(new Date(event.start).getTime()))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 7)
      .map((event) => {
        const { day, time } = formatDayAndTime(event.start, event.end);
        return {
          day,
          time,
          title: event.summary,
          category: categorize(event.summary),
        };
      });

    return Response.json({ events: upcoming }, { status: 200 });
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
