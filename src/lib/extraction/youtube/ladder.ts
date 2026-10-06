import type { AttemptReason } from "@/lib/ai/attempt-reasons";

export const DESCRIPTION_MIN_CHARS = 100;
export const DESCRIPTION_MAX_CHARS = 60_000;

const URLS = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** The description step runs only on 100 or more characters once links are removed. */
export function hasDescriptionText(description: string): boolean {
  return description.replace(URLS, " ").trim().length >= DESCRIPTION_MIN_CHARS;
}

/** The description as Gemini and grounding see it: cut to 60,000 characters, as lines. */
export function descriptionLines(description: string): readonly string[] {
  return Array.from(description)
    .slice(0, DESCRIPTION_MAX_CHARS)
    .join("")
    .split(/\r?\n/);
}

/** Partial content beats having found nothing (0002 *Ladder rules*), in this order. */
const PARTIAL_REASONS: readonly AttemptReason[] = [
  "missing_ingredients",
  "missing_steps",
  "ungrounded_step",
];

/**
 * When no step produced a recipe: the most informative reason a step reported. Slice 1
 * has no transcript step, so it never ends in `not_a_recipe` or a watchability skip.
 */
export function finalLadderReason(
  seen: readonly AttemptReason[],
): AttemptReason {
  return (
    PARTIAL_REASONS.find((reason) => seen.includes(reason)) ??
    "no_written_recipe"
  );
}
