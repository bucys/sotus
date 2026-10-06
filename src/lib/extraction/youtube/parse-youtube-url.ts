import { normalizeHost } from "../hosts.ts";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

export type YouTubeVideo = {
  readonly videoId: string;
  /** The only URL that ever leaves the parser (0002 AC-2). */
  readonly canonicalUrl: string;
};

export const canonicalVideoUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

function readVideoId(url: URL): string | undefined {
  const host = normalizeHost(url.hostname);
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return segments[0];
  if (!WATCH_HOSTS.has(host)) return undefined;
  if (url.pathname === "/watch") return url.searchParams.get("v") ?? undefined;
  if (segments[0] === "shorts" && segments.length <= 2) return segments[1];
  return undefined;
}

/**
 * Watch, `youtu.be` and Shorts links only; embed, live, playlist and channel links have
 * no usable ID here. Everything about the pasted URL except the ID is discarded.
 */
export function parseYouTubeUrl(text: string): YouTubeVideo | undefined {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

  const videoId = readVideoId(url);
  if (!videoId || !VIDEO_ID.test(videoId)) return undefined;
  return { videoId, canonicalUrl: canonicalVideoUrl(videoId) };
}

/** Rendered from the ID, never from the Data API response (0002 *Data model sketch*). */
export const thumbnailUrl = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
