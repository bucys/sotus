import { z } from "zod";

/** What `videos.list` returns for the `fields` the request asks for; anything else is ignored. */
export const videosListSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z.object({
          title: z.string(),
          description: z.string().default(""),
          channelTitle: z.string().default(""),
          liveBroadcastContent: z.string().default("none"),
        }),
        contentDetails: z
          .object({
            duration: z.string().optional(),
            regionRestriction: z.unknown().optional(),
            contentRating: z
              .object({ ytRating: z.string().optional() })
              .optional(),
          })
          .default({}),
        status: z.object({ privacyStatus: z.string().optional() }).default({}),
      }),
    )
    .default([]),
});

export type VideosList = z.infer<typeof videosListSchema>;

export type Watchability =
  "watchable" | "video_not_watchable" | "video_too_long";

export type VideoDetails = {
  readonly title: string;
  readonly description: string;
  readonly channelTitle: string;
  readonly durationSeconds: number;
  /** Decided from metadata alone; the transcript step (slice 2) reads it. */
  readonly watchability: Watchability;
};

export type VideoDetailsResult =
  | { readonly available: true; readonly video: VideoDetails }
  | { readonly available: false }
  | { readonly available: "error"; readonly status?: number };

export const MAX_WATCH_SECONDS = 1200;

const DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** ISO 8601 as YouTube writes it (`PT1H2M3S`, `P1DT2H`, `P0D`); absent when unreadable. */
export function durationSeconds(text: string | undefined): number | undefined {
  const match = text ? DURATION.exec(text) : null;
  if (!match || text === "P" || text?.endsWith("T")) return undefined;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Math.round(Number(seconds ?? 0))
  );
}

function watchabilityOf(
  item: VideosList["items"][number],
  seconds: number,
): Watchability {
  const { contentDetails, status } = item;
  if (status.privacyStatus !== "public") return "video_not_watchable";
  if (
    contentDetails.contentRating?.ytRating === "ytAgeRestricted" ||
    contentDetails.regionRestriction !== undefined
  ) {
    return "video_not_watchable";
  }
  return seconds > MAX_WATCH_SECONDS ? "video_too_long" : "watchable";
}

/**
 * The watchability table of 0002: empty, live or upcoming means unavailable. A duration
 * we cannot read is a metadata failure, not a long video: `video_too_long` needs a real length.
 */
export function toVideoDetails(list: VideosList): VideoDetailsResult {
  const item = list.items[0];
  if (!item) return { available: false };
  const live = item.snippet.liveBroadcastContent;
  if (live === "live" || live === "upcoming") return { available: false };

  const seconds = durationSeconds(item.contentDetails.duration);
  if (seconds === undefined) return { available: "error" };
  return {
    available: true,
    video: {
      title: item.snippet.title.trim(),
      description: item.snippet.description,
      channelTitle: item.snippet.channelTitle.trim(),
      durationSeconds: seconds,
      watchability: watchabilityOf(item, seconds),
    },
  };
}
