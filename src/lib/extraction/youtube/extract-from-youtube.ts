import "server-only";

import type { AttemptReason } from "@/lib/ai/attempt-reasons";
import { generateRecipeInSteps } from "@/lib/ai/gemini";
import type { Tokens } from "@/lib/ai/quota";
import type { RecipeSourceFields as SourceFields } from "@/lib/recipes/sign-payload";

import {
  acceptModelResponse,
  failed,
  type ExtractionOutcome,
} from "../contract";
import {
  STEP_BUDGET_MS,
  fitsBudget,
  stepSignal,
  type Deadline,
} from "../deadline";
import { TEXT_SYSTEM_INSTRUCTION, buildTextPrompt } from "../prompt";
import { toSourceTitle } from "../titles";

import { readCreatorPage } from "./creator-page";
import {
  descriptionLines,
  finalLadderReason,
  hasDescriptionText,
} from "./ladder";
import type { YouTubeVideo } from "./parse-youtube-url";
import type { VideoDetails } from "./video-details";
import { fetchVideoMetadata } from "./youtube-metadata";

export type YouTubeExtraction = {
  readonly result: ExtractionOutcome;
  readonly fields: SourceFields;
  readonly tokens: Tokens;
  /** Fields for the attempt's JSON log line. Never description text or the API key. */
  readonly log: Readonly<Record<string, unknown>>;
};

const NO_TOKENS: Tokens = { input: 0, output: 0 };

const timedOut = (
  fields: SourceFields,
  tokens: Tokens,
  log: Readonly<Record<string, unknown>>,
): YouTubeExtraction => ({
  result: failed("ingestion_failed", "timeout"),
  fields,
  tokens,
  log,
});

function sourceFields(video: VideoDetails): SourceFields {
  return {
    source_title: toSourceTitle(video.title),
    source_channel_title: toSourceTitle(video.channelTitle),
  };
}

// These end the ladder: a later step would hit the same provider or the same deadline.
const LADDER_ENDING_REASONS: ReadonlySet<string> = new Set([
  "provider_error",
  "provider_rejected",
  "timeout",
]);

/**
 * The YouTube pipeline after reservation (0002 *Pipeline*): metadata, then the creator's
 * recipe page, then the description. Ends in exactly one contract outcome; saving or
 * finishing the attempt is the caller's job.
 */
export async function extractFromYouTube(
  target: YouTubeVideo,
  deadline: Deadline,
): Promise<YouTubeExtraction> {
  if (!fitsBudget(deadline, STEP_BUDGET_MS.youtubeMetadata)) {
    return timedOut({}, NO_TOKENS, {});
  }
  const metadataStart = Date.now();
  const metadata = await fetchVideoMetadata(
    target.videoId,
    stepSignal(deadline, STEP_BUDGET_MS.youtubeMetadata),
  );
  const metadataLog = {
    video_id: target.videoId,
    metadata_ms: Date.now() - metadataStart,
  };
  if (metadata.available === "error") {
    return {
      result: failed("ingestion_failed", "metadata_unavailable"),
      fields: {},
      tokens: NO_TOKENS,
      log: { ...metadataLog, metadata_status: metadata.status },
    };
  }
  if (!metadata.available) {
    return {
      result: failed("ingestion_failed", "video_unavailable"),
      fields: {},
      tokens: NO_TOKENS,
      log: metadataLog,
    };
  }

  const { video } = metadata;
  const fields = sourceFields(video);
  const videoLog = {
    ...metadataLog,
    duration_s: video.durationSeconds,
    watchability: video.watchability,
  };

  if (!fitsBudget(deadline, STEP_BUDGET_MS.creatorPage)) {
    return timedOut(fields, NO_TOKENS, videoLog);
  }
  const creatorStart = Date.now();
  const creator = await readCreatorPage(
    video.description,
    video.title,
    stepSignal(deadline, STEP_BUDGET_MS.creatorPage),
  );
  const creatorLog = {
    ...videoLog,
    ...creator.log,
    creator_ms: Date.now() - creatorStart,
  };
  if (creator.found) {
    return {
      result: {
        outcome: "recipe",
        recipe: creator.found.recipe,
        method: "youtube_recipe_page_jsonld",
      },
      fields: { ...fields, recipe_page_url: creator.found.recipePageUrl },
      tokens: NO_TOKENS,
      log: creatorLog,
    };
  }

  const seen: AttemptReason[] = [];
  const ladderEnd = (
    tokens: Tokens,
    log: Readonly<Record<string, unknown>>,
  ) => ({
    result: failed("insufficient", finalLadderReason(seen)),
    fields,
    tokens,
    log,
  });

  if (!hasDescriptionText(video.description)) {
    return ladderEnd(NO_TOKENS, { ...creatorLog, description: "too_short" });
  }
  if (!fitsBudget(deadline, STEP_BUDGET_MS.youtubeDescription)) {
    return timedOut(fields, NO_TOKENS, creatorLog);
  }

  const lines = descriptionLines(video.description);
  const geminiStart = Date.now();
  const gemini = await generateRecipeInSteps(
    TEXT_SYSTEM_INSTRUCTION,
    buildTextPrompt(video.title, lines),
    () =>
      fitsBudget(deadline, STEP_BUDGET_MS.youtubeDescription)
        ? stepSignal(deadline, STEP_BUDGET_MS.youtubeDescription)
        : undefined,
  );
  const geminiLog = {
    ...creatorLog,
    gemini_calls: gemini.calls,
    gemini_ms: Date.now() - geminiStart,
  };

  if (!gemini.ok) {
    const log = { ...geminiLog, gemini_error: gemini.failure.row };
    if (LADDER_ENDING_REASONS.has(gemini.failure.reason)) {
      return {
        result: failed("ingestion_failed", gemini.failure.reason),
        fields,
        tokens: gemini.tokens,
        log,
      };
    }
    // `model_blocked` and `invalid_model_output` fall through to the next step.
    return ladderEnd(gemini.tokens, log);
  }

  const accepted = acceptModelResponse(gemini.response, {
    method: "youtube_description",
    sourceLines: [video.title, ...lines],
    titleAfter: video.title,
  });
  const acceptedLog = {
    ...geminiLog,
    dropped_ingredients: accepted.droppedIngredients,
    cleared_amounts: accepted.clearedAmounts,
  };
  if (accepted.result.outcome === "recipe") {
    return {
      result: accepted.result,
      fields,
      tokens: gemini.tokens,
      log: acceptedLog,
    };
  }

  if (accepted.result.outcome === "insufficient") {
    seen.push(accepted.result.reason);
  }
  return ladderEnd(gemini.tokens, {
    ...acceptedLog,
    description_outcome: accepted.result.outcome,
    description_reason: accepted.result.reason,
  });
}
