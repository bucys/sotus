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
  "site_blocked",
  "page_not_found",
  "fetch_failed",
  "too_many_redirects",
  "too_large",
  "unsupported_content",
  "page_unreadable",
  "provider_rejected",
  "model_blocked",
  "multiple_recipes",
  "missing_title",
  "internal_error",
] as const;

export type AttemptReason = (typeof ATTEMPT_REASONS)[number];

/**
 * What the add form can receive: every stored reason, plus four that are never stored
 * because no attempt row exists when they happen.
 */
export type ActionReason =
  | AttemptReason
  | "invalid_link"
  | "signed_out"
  | "unavailable"
  | "service_unavailable";

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

export type PreAttemptReason =
  "quota_exceeded" | "blocked_url" | "service_unavailable";

/**
 * Before an attempt row exists (`open_existing_recipe`, `reserve_ai_attempt`) there is
 * nothing to finish, so anything unexpected, including a transport error, means the
 * database is out of reach rather than a failed extraction.
 */
export function reasonBeforeAttempt(
  error: { readonly message: string } | undefined,
): PreAttemptReason {
  if (error?.message === "quota_exceeded") return "quota_exceeded";
  if (error?.message === "invalid_source_url") return "blocked_url";
  return "service_unavailable";
}

/** Only for `save_recipe`: any database error, known or not, ends as `ingestion_failed`. */
export function ingestionFailedFromDatabaseError(
  error: { readonly message: string } | undefined,
): IngestionFailed {
  return {
    outcome: "ingestion_failed",
    reason: reasonByDatabaseError.get(error?.message ?? "") ?? "save_failed",
  };
}
