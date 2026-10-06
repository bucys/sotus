import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  signRecipePayload,
  type RecipePayload,
} from "@/lib/recipes/sign-payload";

import {
  ingestionFailedFromDatabaseError,
  reasonBeforeAttempt,
  type AttemptOutcome,
  type AttemptReason,
  type PreAttemptReason,
} from "./attempt-reasons";

export type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type AttemptKind = Database["public"]["Enums"]["ai_attempt_kind"];
type SourceKind = Database["public"]["Enums"]["source_kind"];

export type Tokens = { readonly input: number; readonly output: number };

export type PreAttemptFailure = {
  readonly ok: false;
  readonly reason: PreAttemptReason;
};

/** Links an existing recipe to the caller before any quota is spent. */
export async function openExistingRecipe(
  supabase: Supabase,
  kind: SourceKind,
  sourceUrl: string,
  signal: AbortSignal,
): Promise<
  { readonly ok: true; readonly recipeId?: string } | PreAttemptFailure
> {
  const { data, error } = await supabase
    .rpc("open_existing_recipe", { p_kind: kind, p_source_url: sourceUrl })
    .abortSignal(signal);
  if (error) return { ok: false, reason: reasonBeforeAttempt(error) };
  return { ok: true, recipeId: data ?? undefined };
}

/**
 * Never aborted from here: a committed reservation must not be lost to a client side
 * abort, or it would leave an orphan `started` row.
 */
export async function reserveAttempt(
  supabase: Supabase,
  kind: AttemptKind,
  sourceUrl: string,
): Promise<
  { readonly ok: true; readonly attemptId: string } | PreAttemptFailure
> {
  const { data, error } = await supabase.rpc("reserve_ai_attempt", {
    p_kind: kind,
    p_source_url: sourceUrl,
  });
  if (error || !data)
    return { ok: false, reason: reasonBeforeAttempt(error ?? undefined) };
  return { ok: true, attemptId: data };
}

/** Its own failure is logged, never shown: the row then reads as `interrupted`. */
export async function finishAttempt(
  supabase: Supabase,
  attemptId: string,
  outcome: Exclude<AttemptOutcome, "started" | "recipe">,
  reason: AttemptReason,
  tokens: Tokens,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("finish_ai_attempt", {
      p_attempt_id: attemptId,
      p_outcome: outcome,
      p_reason: reason,
      p_input_tokens: tokens.input,
      p_output_tokens: tokens.output,
    });
    if (error) throw error;
  } catch {
    console.error(
      JSON.stringify({ event: "finish_failed", attempt_id: attemptId, reason }),
    );
  }
}

export type SaveResult =
  | { readonly ok: true; readonly recipeId: string; readonly created: boolean }
  | { readonly ok: false; readonly reason: AttemptReason };

/** Saves the recipe and finishes the attempt in one transaction (0003). */
export async function saveRecipe(
  supabase: Supabase,
  attemptId: string,
  userId: string,
  payload: RecipePayload,
  tokens: Tokens,
): Promise<SaveResult> {
  const signed = signRecipePayload(attemptId, userId, payload);
  const { data, error } = await supabase.rpc("save_recipe", {
    p_attempt_id: attemptId,
    p_payload: signed.payload,
    p_signature: signed.signature,
    p_input_tokens: tokens.input,
    p_output_tokens: tokens.output,
  });
  const row = data?.[0];
  if (error || !row) {
    return {
      ok: false,
      reason: ingestionFailedFromDatabaseError(error ?? undefined).reason,
    };
  }
  return { ok: true, recipeId: row.out_recipe_id, created: row.out_created };
}
