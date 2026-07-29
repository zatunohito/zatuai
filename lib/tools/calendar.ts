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

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
}

const IGNORED_SUMMARIES = new Set(["長期開発プロジェクト", "長期開発 定例会"]);

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
    throw new Error(`Failed to obtain access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";

  const params = new URLSearchParams();
  params.append("timeMin", start);
  params.append("timeMax", end);
  params.append("singleEvents", "true");
  params.append("orderBy", "startTime");

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch calendar events: ${response.status} ${text}`);
  }

  const data = await response.json();
  const items: GoogleCalendarApiItem[] = data.items ?? [];

  return items
    .filter((item) => !IGNORED_SUMMARIES.has(item.summary ?? ""))
    .map((item) => ({
      summary: item.summary ?? "",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
    }));
}
