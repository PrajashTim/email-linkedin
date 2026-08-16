import { NextRequest, NextResponse } from "next/server";

type YouTubeVideo = {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function matchValue(source: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function resolveChannelId(channelUrl: URL) {
  const direct = channelUrl.pathname.match(/^\/channel\/(UC[\w-]+)/i)?.[1];
  if (direct) return direct;

  const response = await fetch(channelUrl.toString(), {
    headers: { "user-agent": "Mozilla/5.0 LeadGenCommandCenter/1.0" },
    next: { revalidate: 86400 },
  });
  if (!response.ok) return "";

  const html = await response.text();
  return matchValue(html, [
    /"channelId":"(UC[\w-]+)"/,
    /"externalId":"(UC[\w-]+)"/,
    /itemprop="channelId"\s+content="(UC[\w-]+)"/,
  ]);
}

function parseFeed(xml: string): YouTubeVideo[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).flatMap((match) => {
    const entry = match[1];
    const id = matchValue(entry, [/<yt:videoId>([^<]+)<\/yt:videoId>/]);
    const title = decodeXml(matchValue(entry, [/<title>([\s\S]*?)<\/title>/]));
    const published = matchValue(entry, [/<published>([^<]+)<\/published>/]);
    if (!id) return [];
    return [{
      id,
      title: title || "YouTube video",
      published,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    }];
  });
}

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get("channel");
  if (!channel) return NextResponse.json({ error: "Channel URL is required" }, { status: 400 });

  let channelUrl: URL;
  try {
    channelUrl = new URL(channel);
  } catch {
    return NextResponse.json({ error: "Invalid channel URL" }, { status: 400 });
  }

  if (channelUrl.protocol !== "https:" || !YOUTUBE_HOSTS.has(channelUrl.hostname)) {
    return NextResponse.json({ error: "Only YouTube channel URLs are supported" }, { status: 400 });
  }

  try {
    const channelId = await resolveChannelId(channelUrl);
    if (!channelId) return NextResponse.json({ error: "Could not resolve this YouTube channel" }, { status: 404 });

    const feed = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      next: { revalidate: 3600 },
    });
    if (!feed.ok) return NextResponse.json({ error: "YouTube feed is temporarily unavailable" }, { status: 502 });

    return NextResponse.json(
      { channelId, videos: parseFeed(await feed.text()) },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Could not load YouTube videos" }, { status: 502 });
  }
}
