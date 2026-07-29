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

const JST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function jstParts(date: Date) {
  const parts = Object.fromEntries(
    JST_PARTS.formatToParts(date).map((part) => [part.type, part.value])
  );
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    month: parts.month,
    day: parts.day,
    weekdayKanji: WEEKDAY_KANJI[weekdayIndex],
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
  };
}

function formatDayAndTime(startIso: string, endIso: string): { day: string; time: string } {
  const hasTime = startIso.includes("T");
  const start = jstParts(new Date(startIso));

  if (!hasTime) {
    return { day: `${start.month}/${start.day}`, time: "終日" };
  }

  const end = jstParts(new Date(endIso));
  return {
    day: start.weekdayKanji,
    time: `${start.hour}:${start.minute}〜${end.hour}:${end.minute}`,
  };
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
