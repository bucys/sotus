import type { ActionReason } from "@/lib/ai/attempt-reasons";
import { errorMessages } from "@/lib/auth/messages";

export type MessageSource = "web" | "youtube";

/** Keyed `source:reason`, with `any:reason` as the fallback. */
const MESSAGES: ReadonlyMap<string, string> = new Map([
  ["any:invalid_link", "Paste a full link that starts with https://"],
  ["any:signed_out", "You're signed out. Sign in again to add recipes."],
  ["any:unavailable", errorMessages.unavailable],
  [
    "any:service_unavailable",
    "Sotus can't reach its database right now. Try again in a minute.",
  ],
  [
    "any:quota_exceeded",
    "You've reached today's limit for adding recipes. Try again tomorrow.",
  ],
  ["web:blocked_url", "We can't open that link."],
  [
    "web:site_blocked",
    "This site doesn't let us read its pages. Try another link.",
  ],
  ["web:page_not_found", "We couldn't find that page. Check the link."],
  [
    "web:fetch_failed",
    "We couldn't reach that page. Check the link or try again later.",
  ],
  [
    "web:too_many_redirects",
    "That link redirects too many times. Paste the final page link.",
  ],
  ["web:too_large", "That page is too big for us to read. Try another link."],
  ["web:unsupported_content", "That link isn't a web page we can read."],
  ["web:page_unreadable", "We couldn't read this page. Try another link."],
  ["web:timeout", "This took too long. Try again in a minute."],
  [
    "any:provider_error",
    "Our recipe reader is busy right now. Try again in a minute.",
  ],
  [
    "any:provider_rejected",
    "Our recipe reader isn't working right now. Please try again later.",
  ],
  [
    "web:model_blocked",
    "We couldn't read a recipe from this page. Try another link.",
  ],
  [
    "web:invalid_model_output",
    "Something went wrong reading this page. Try again.",
  ],
  ["any:save_failed", "Something went wrong saving this recipe. Try again."],
  ["any:internal_error", "Something went wrong on our side. Try again."],
  [
    "any:missing_ingredients",
    "We found cooking content but not a full recipe. The ingredient list is missing.",
  ],
  [
    "any:missing_steps",
    "We found cooking content but not a full recipe. The steps are missing.",
  ],
  [
    "web:missing_title",
    "We found a recipe but couldn't tell what it's called, so we didn't save it.",
  ],
  [
    "web:multiple_recipes",
    "This page has more than one recipe. Paste a link to a page with just one.",
  ],
  [
    "web:ungrounded_step",
    "We found a recipe, but some steps weren't stated clearly on the page, so we didn't save it.",
  ],
  ["any:not_a_recipe", "This link does not contain a recipe."],
  ["youtube:blocked_url", "That YouTube link doesn't point to a video."],
  [
    "youtube:video_unavailable",
    "This video isn't available. It may be private, deleted or still live.",
  ],
  [
    "youtube:metadata_unavailable",
    "We couldn't reach YouTube just now. Try again in a minute.",
  ],
  [
    "youtube:timeout",
    "This took too long. Try again, or paste a link to the recipe page.",
  ],
  [
    "youtube:invalid_model_output",
    "Something went wrong reading this video. Try again.",
  ],
  [
    "youtube:no_written_recipe",
    "This video doesn't include a written recipe we can read yet.",
  ],
  [
    "youtube:video_too_long",
    "This video is too long for us to watch. Paste one under 20 minutes, or a link to its recipe page.",
  ],
  [
    "youtube:video_not_watchable",
    "We can't watch this video, and its description has no recipe.",
  ],
  [
    "youtube:no_stated_recipe",
    "We found cooking content but not a full recipe. Nothing in the video states the ingredients and steps.",
  ],
  [
    "youtube:ungrounded_step",
    "We found a recipe, but some steps weren't stated clearly in the video, so we didn't save it.",
  ],
]);

export const ALREADY_IN_LIBRARY_VIDEO_NOTICE =
  "This video is already in the library.";

export const ALREADY_IN_LIBRARY_NOTICE =
  "This recipe is already in the library. We added it to your collection.";

/** Every user facing failure text comes from here; raw error text never reaches the user. */
export function messageFor(
  source: MessageSource,
  reason: ActionReason,
): string {
  return (
    MESSAGES.get(`${source}:${reason}`) ??
    MESSAGES.get(`any:${reason}`) ??
    MESSAGES.get("any:internal_error") ??
    ""
  );
}
