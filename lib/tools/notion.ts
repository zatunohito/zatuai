interface NotionStatus {
  pageId: string;
  title: string;
  status: string;
  lastUpdated: string;
}

const NOTION_API_VERSION = "2022-06-28";

export async function getNotionStatus(): Promise<NotionStatus> {
  try {
    const token = process.env.NOTION_TOKEN;
    const pageId = process.env.NOTION_PAGE_ID;

    if (!token) {
      throw new Error("NOTION_TOKEN environment variable is not set");
    }
    if (!pageId) {
      throw new Error("NOTION_PAGE_ID environment variable is not set");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
    };

    const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers,
    });

    if (!pageRes.ok) {
      const body = await pageRes.text();
      console.error(`Notion page fetch failed with status ${pageRes.status}: ${body}`);
      throw new Error("Notion page fetch failed");
    }

    const page = await pageRes.json();

    let title = "";
    for (const prop of Object.values(page.properties)) {
      const p = prop as { title?: { plain_text: string }[] };
      if (p.title && p.title.length > 0) {
        title = p.title.map((t) => t.plain_text).join("");
        break;
      }
    }

    const blocksRes = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      { headers },
    );

    if (!blocksRes.ok) {
      const body = await blocksRes.text();
      console.error(`Notion blocks fetch failed with status ${blocksRes.status}: ${body}`);
      throw new Error("Notion blocks fetch failed");
    }

    const blocks = await blocksRes.json();
    const results: unknown[] = blocks.results ?? [];

    const blockTexts: string[] = [];
    for (const block of results) {
      const b = block as Record<string, { rich_text?: { plain_text: string }[] }>;
      const content = b[(block as { type: string }).type];
      if (content && content.rich_text && content.rich_text.length > 0) {
        blockTexts.push(content.rich_text.map((rt) => rt.plain_text).join(""));
      }
    }

    return {
      pageId,
      title,
      status: blockTexts.join("\n"),
      lastUpdated: page.last_edited_time,
    };
  } catch (e) {
    throw new Error(
      `Failed to fetch Notion status: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
