export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 인공지능 한이룸 채널. RSS는 공개 피드라 API 키가 필요 없다. */
const CHANNEL_ID = "UCUxQ8mc0TJZP9NC1Wj9NUOg";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const MAX_VIDEOS = 10;
const CACHE_MS = 60 * 60 * 1000;

export type WaitingVideoItem = { videoId: string; title: string; publishedAt: string };

let cache: { fetchedAt: number; videos: WaitingVideoItem[] } | null = null;

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parseFeed(xml: string): WaitingVideoItem[] {
  const entries = xml.split("<entry>").slice(1);
  const videos: WaitingVideoItem[] = [];
  for (const entry of entries) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";
    if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) && title) videos.push({ videoId, title: decodeXml(title), publishedAt });
    if (videos.length >= MAX_VIDEOS) break;
  }
  return videos;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) return Response.json({ ok: true, videos: cache.videos, cached: true });
  try {
    const response = await fetch(FEED_URL, { headers: { "user-agent": "Mozilla/5.0 (pdp-maker waiting-videos)" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`feed ${response.status}`);
    const videos = parseFeed(await response.text());
    if (!videos.length) throw new Error("empty feed");
    cache = { fetchedAt: now, videos };
    return Response.json({ ok: true, videos, cached: false });
  } catch (error) {
    // 피드 실패 시 마지막 캐시라도 돌려주고, 없으면 클라이언트가 기본 영상으로 폴백한다.
    if (cache) return Response.json({ ok: true, videos: cache.videos, cached: true, stale: true });
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "feed error" }, { status: 502 });
  }
}
