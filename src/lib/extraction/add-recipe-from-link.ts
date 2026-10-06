"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import type { ActionReason } from "@/lib/ai/attempt-reasons";
import {
  finishAttempt,
  openExistingRecipe,
  reserveAttempt,
  saveRecipe,
  type Supabase,
  type Tokens,
} from "@/lib/ai/quota";
import { signInPath } from "@/lib/auth/origin";
import { requireActionUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AddLinkState } from "./add-link-state";
import {
  STEP_BUDGET_MS,
  createDeadline,
  raceSignal,
  stepSignal,
} from "./deadline";
import { extractFromWeb } from "./extract-from-web";
import { isYouTubeHost, normalizeHost } from "./hosts";
import { messageFor, type MessageSource } from "./messages";
import { linkInputSchema } from "./schemas";

const NO_TOKENS: Tokens = { input: 0, output: 0 };

const recipePath = (recipeId: string, duplicate: boolean) =>
  duplicate
    ? `/recipes/${recipeId}?notice=already-in-library`
    : `/recipes/${recipeId}`;

function failure(
  url: string,
  reason: ActionReason,
  source: MessageSource = "web",
): AddLinkState {
  return {
    status: "failed",
    url,
    reason,
    message: messageFor(source, reason),
    target: reason === "invalid_link" ? "field" : "alert",
    ...(reason === "signed_out"
      ? { signInHref: signInPath(undefined, "/") }
      : {}),
  };
}

type PreAttemptStage = "auth" | "dedup" | "reserve";

function logPreAttemptFailure(stage: PreAttemptStage, host: string) {
  console.error(JSON.stringify({ event: "pre_attempt_failed", stage, host }));
}

type Attempt = {
  readonly supabase: Supabase;
  readonly attemptId: string;
};

/**
 * The one entry point for a pasted link, shared by web pages (#6) and YouTube (#7).
 * Success always ends in `redirect()`; every failure returns a typed state.
 */
export async function addRecipeFromLink(
  _previous: AddLinkState,
  formData: FormData,
): Promise<AddLinkState> {
  const deadline = createDeadline(Date.now());
  const submitted = formData.get("url");
  const raw = typeof submitted === "string" ? submitted : "";

  const parsedLink = linkInputSchema.safeParse(raw);
  if (!parsedLink.success) return failure(raw, "invalid_link");
  const url = parsedLink.data;
  const host = normalizeHost(new URL(url).hostname);

  let stage: PreAttemptStage = "auth";
  let attempt: Attempt | undefined;
  try {
    // Auth and the duplicate lookup share one 2 s budget; an abort here leaves no row.
    const preAttemptSignal = stepSignal(deadline, STEP_BUDGET_MS.authAndDedup);
    const user = await raceSignal(requireActionUser(), preAttemptSignal);
    if (!user.ok) return failure(raw, user.reason);

    if (isYouTubeHost(url)) {
      // #7 slice 1 plugs `extractFromYouTube` in here. #6 and #7 ship together
      // (0006 AC-15), so this branch must not reach production before it does.
      return failure(raw, "blocked_url");
    }

    stage = "dedup";
    const supabase = await createSupabaseServerClient();
    const existing = await openExistingRecipe(
      supabase,
      "web",
      url,
      preAttemptSignal,
    );
    if (!existing.ok) {
      logPreAttemptFailure("dedup", host);
      return failure(raw, existing.reason);
    }
    if (existing.recipeId) redirect(recipePath(existing.recipeId, true));

    stage = "reserve";
    const reserved = await reserveAttempt(supabase, "extract_web", url);
    if (!reserved.ok) {
      if (reserved.reason === "service_unavailable")
        logPreAttemptFailure("reserve", host);
      return failure(raw, reserved.reason);
    }
    attempt = { supabase, attemptId: reserved.attemptId };

    const extraction = await extractFromWeb(url, deadline);
    const { result, tokens } = extraction;
    const logLine = (outcome: string, reason: string | undefined) => {
      const line = {
        event: "extraction",
        kind: "extract_web",
        attempt_id: reserved.attemptId,
        host,
        outcome,
        reason,
        method: result.outcome === "recipe" ? result.method : undefined,
        ...extraction.log,
        total_ms: Date.now() - deadline.start,
        input_tokens: tokens.input,
        output_tokens: tokens.output,
      };
      const log = reason === "provider_rejected" ? console.error : console.info;
      log(JSON.stringify(line));
    };

    if (result.outcome !== "recipe") {
      logLine(result.outcome, result.reason);
      await finishAttempt(
        supabase,
        reserved.attemptId,
        result.outcome,
        result.reason,
        tokens,
      );
      return failure(raw, result.reason);
    }

    const saved = await saveRecipe(
      supabase,
      reserved.attemptId,
      user.userId,
      {
        title: result.recipe.title,
        extraction_method: result.method,
        source_title: extraction.sourceTitle,
        ingredients: result.recipe.ingredients,
        steps: result.recipe.steps,
      },
      tokens,
    );
    if (!saved.ok) {
      logLine("ingestion_failed", saved.reason);
      await finishAttempt(
        supabase,
        reserved.attemptId,
        "ingestion_failed",
        saved.reason,
        tokens,
      );
      return failure(raw, saved.reason);
    }

    logLine("recipe", saved.created ? undefined : "already_saved");
    redirect(recipePath(saved.recipeId, !saved.created));
  } catch (error) {
    // `redirect()` works by throwing; it must reach Next.js, not the catch all below.
    unstable_rethrow(error);

    if (!attempt) {
      logPreAttemptFailure(stage, host);
      return failure(raw, "service_unavailable");
    }
    console.error(
      JSON.stringify({
        event: "extraction",
        kind: "extract_web",
        attempt_id: attempt.attemptId,
        host,
        outcome: "ingestion_failed",
        reason: "internal_error",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    await finishAttempt(
      attempt.supabase,
      attempt.attemptId,
      "ingestion_failed",
      "internal_error",
      NO_TOKENS,
    );
    return failure(raw, "internal_error");
  }
}
