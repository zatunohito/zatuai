interface GoogleCalendarApiItem {
  summary?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
}

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
}

const IGNORED_SUMMARIES = new Set(["長期開発プロジェクト", "長期開発 定例会"]);

const PUBLIC_MARKER_RE = /\(公開\)|（公開）/;

const MASKED_SUMMARY = "予定あり";

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams();
  body.append("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  body.append("client_secret", process.env.GOOGLE_CLIENT_SECRET ?? "");
  body.append("refresh_token", process.env.GOOGLE_REFRESH_TOKEN ?? "");
  body.append("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to obtain access token: ${response.status} ${text}`);
    throw new Error("Failed to obtain access token");
  }

  const data = await response.json();
  return data.access_token;
}

function toRfc3339(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }
  return parsed.toISOString();
}

// Public callers (the LLM tool and the anonymous /api/upcoming endpoint) must
// not be able to pull arbitrary past or far-future ranges, so the window is
// clamped server-side regardless of what was requested.
const MAX_RANGE_PAST_MS = 24 * 60 * 60 * 1000; // 1 day
const MAX_RANGE_FUTURE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";

  const now = Date.now();
  const earliestAllowed = new Date(now - MAX_RANGE_PAST_MS);
  const latestAllowed = new Date(now + MAX_RANGE_FUTURE_MS);

  const requestedStart = new Date(toRfc3339(start, "start"));
  const requestedEnd = new Date(toRfc3339(end, "end"));

  const clampedStart = requestedStart < earliestAllowed ? earliestAllowed : requestedStart;
  const clampedEnd = requestedEnd > latestAllowed ? latestAllowed : requestedEnd;

  const params = new URLSearchParams();
  params.append("timeMin", clampedStart.toISOString());
  params.append("timeMax", clampedEnd.toISOString());
  params.append("singleEvents", "true");
  params.append("orderBy", "startTime");

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to fetch calendar events: ${response.status} ${text}`);
    throw new Error("Failed to fetch calendar events");
  }

  const data = await response.json();
  const items: GoogleCalendarApiItem[] = data.items ?? [];

  return items
    .filter((item) => !IGNORED_SUMMARIES.has(item.summary ?? ""))
    .map((item) => {
      const raw = item.summary ?? "";
      if (PUBLIC_MARKER_RE.test(raw)) {
        return {
          summary: raw.replace(PUBLIC_MARKER_RE, "").trim(),
          start: item.start?.dateTime ?? item.start?.date ?? "",
          end: item.end?.dateTime ?? item.end?.date ?? "",
        };
      }
      return {
        summary: MASKED_SUMMARY,
        start: item.start?.dateTime ?? item.start?.date ?? "",
        end: item.end?.dateTime ?? item.end?.date ?? "",
      };
    });
}
