import type { Database } from "@/lib/supabase/database.types";

export type AttemptOutcome = Database["public"]["Enums"]["ai_attempt_outcome"];

/**
 * Every reason stored in `ai_attempts.reason`. It is text in the database (at most 60
 * characters), so this union is the only list of valid values.
 */
export const ATTEMPT_REASONS = [
  "blocked_url",
  "video_unavailable",
  "metadata_unavailable",
  "quota_exceeded",
  "provider_error",
  "timeout",
  "invalid_model_output",
  "no_written_recipe",
  "video_too_long",
  "video_not_watchable",
  "missing_ingredients",
  "missing_steps",
  "no_stated_recipe",
  "ungrounded_step",
  "not_a_recipe",
  "already_saved",
  "save_failed",
] as const;

export type AttemptReason = (typeof ATTEMPT_REASONS)[number];

export type IngestionFailed = {
  readonly outcome: "ingestion_failed";
  readonly reason: AttemptReason;
};

// A Map, not an object: a database message like "constructor" must not hit the prototype.
const reasonByDatabaseError: ReadonlyMap<string, AttemptReason> = new Map([
  ["quota_exceeded", "quota_exceeded"],
  ["invalid_source_url", "blocked_url"],
  ["invalid_recipe", "invalid_model_output"],
  ["invalid_signature", "save_failed"],
  ["publish_not_configured", "save_failed"],
  ["attempt_not_found", "save_failed"],
  ["invalid_arguments", "save_failed"],
  ["invalid_outcome", "save_failed"],
  ["not_authenticated", "save_failed"],
  ["recipe_not_resolved", "save_failed"],
]);

/** Any database error, known or not, ends an extraction as `ingestion_failed`. */
export function ingestionFailedFromDatabaseError(
  error: { readonly message: string } | undefined,
): IngestionFailed {
  return {
    outcome: "ingestion_failed",
    reason: reasonByDatabaseError.get(error?.message ?? "") ?? "save_failed",
  };
}
