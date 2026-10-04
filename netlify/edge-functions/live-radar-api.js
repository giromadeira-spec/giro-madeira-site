const FEEDS = [
  { source: "G1 Rondônia", url: "https://g1.globo.com/dynamo/ro/rondonia/rss2.xml", priority: 3 },
  { source: "G1", url: "https://g1.globo.com/rss/g1/", priority: 2 },
  { source: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", priority: 1 },
];

function clean(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function field(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? clean(match[1]) : "";
}

function parseFeed(xml, source, priority) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 20).map((block) => {
    const title = field(block, "title");
    const link = field(block, "link") || field(block, "guid");
    const pubDate = field(block, "pubDate") || field(block, "dc:date");
    const timestamp = Date.parse(pubDate) || 0;
    return { title, link, pubDate, timestamp, source, priority };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.link));
}

async function loadFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: { "user-agent": "GiroMadeiraRadar/1.0 (+https://giromadeira.netlify.app)" },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeed(xml, feed.source, feed.priority);
  } catch {
    return [];
  }
}

export default async () => {
  const batches = await Promise.all(FEEDS.map(loadFeed));
  const seen = new Set();
  const items = batches.flat()
    .sort((a, b) => (b.timestamp - a.timestamp) || (b.priority - a.priority))
    .filter((item) => {
      const key = item.title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9à-ÿ]+/gi, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map(({ priority, timestamp, ...item }) => item);

  return new Response(JSON.stringify({
    updatedAt: new Date().toISOString(),
    refreshSeconds: 60,
    items,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
      "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=30",
      "access-control-allow-origin": "*",
    },
  });
};

export const config = {
  path: "/api/live-radar",
  cache: "manual",
  onError: "bypass",
};
