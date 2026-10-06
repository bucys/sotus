import "server-only";

import {
  toVideoDetails,
  videosListSchema,
  type VideoDetailsResult,
} from "./video-details";

const FIELDS =
  "items(snippet(title,description,channelTitle,thumbnails,liveBroadcastContent),contentDetails(duration,regionRestriction,contentRating/ytRating),status/privacyStatus)";

export type MetadataResult = VideoDetailsResult;

/**
 * Read per call, not at import: the shared add link action loads this module for web
 * links too, and a missing YouTube key must not take the web path down with it.
 */
export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

/**
 * One `videos.list` call to a fixed host, so it does not go through `safeFetch`. The
 * request URL carries the key: nothing here may log or return the URL or a raw error.
 */
export async function fetchVideoMetadata(
  videoId: string,
  signal: AbortSignal,
): Promise<MetadataResult> {
  // The add link action checks `isYouTubeConfigured()` before reserving; this guard
  // only narrows the type.
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error(
      JSON.stringify({ event: "youtube_not_configured", video_id: videoId }),
    );
    return { available: "error" };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  url.searchParams.set("part", "snippet,contentDetails,status");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal, cache: "no-store" });
  } catch {
    console.error(
      JSON.stringify({ event: "youtube_metadata_failed", video_id: videoId }),
    );
    return { available: "error" };
  }

  if (!response.ok) {
    console.error(
      JSON.stringify({
        event: "youtube_metadata_failed",
        video_id: videoId,
        http_status: response.status,
      }),
    );
    return { available: "error", status: response.status };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  const parsed = videosListSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        event: "youtube_metadata_failed",
        video_id: videoId,
        http_status: response.status,
        error: "schema",
      }),
    );
    return { available: "error", status: response.status };
  }
  const details = toVideoDetails(parsed.data);
  if (details.available === "error") {
    console.error(
      JSON.stringify({
        event: "youtube_metadata_failed",
        video_id: videoId,
        error: "duration",
      }),
    );
  }
  return details;
}
