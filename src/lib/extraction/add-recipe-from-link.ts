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
import type { RecipeSourceFields } from "@/lib/recipes/sign-payload";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { AddLinkState } from "./add-link-state";
import type { ExtractionOutcome } from "./contract";
import {
  STEP_BUDGET_MS,
  createDeadline,
  raceSignal,
  stepSignal,
  type Deadline,
} from "./deadline";
import { extractFromWeb } from "./extract-from-web";
import { isYouTubeHost, normalizeHost } from "./hosts";
import { messageFor, type MessageSource } from "./messages";
import { linkInputSchema } from "./schemas";
import { extractFromYouTube } from "./youtube/extract-from-youtube";
import { parseYouTubeUrl } from "./youtube/parse-youtube-url";

const NO_TOKENS: Tokens = { input: 0, output: 0 };

const recipePath = (recipeId: string, duplicate: boolean) =>
  duplicate
    ? `/recipes/${recipeId}?notice=already-in-library`
    : `/recipes/${recipeId}`;

// A link that is not a usable YouTube video is a field error, like a malformed link.
const isFieldError = (source: MessageSource, reason: ActionReason) =>
  reason === "invalid_link" ||
  (source === "youtube" && reason === "blocked_url");

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
    target: isFieldError(source, reason) ? "field" : "alert",
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

type Extraction = {
  readonly result: ExtractionOutcome;
  readonly fields: RecipeSourceFields;
  readonly tokens: Tokens;
  readonly log: Readonly<Record<string, unknown>>;
};

/** Everything that differs between a web page and a YouTube video after parsing. */
type Route = {
  readonly source: MessageSource;
  readonly attemptKind: "extract_web" | "extract_youtube";
  /** The URL dedup, the attempt and the recipe use: the link itself, or the canonical video URL. */
  readonly sourceUrl: string;
  readonly extract: (deadline: Deadline) => Promise<Extraction>;
};

function webRoute(url: string): Route {
  return {
    source: "web",
    attemptKind: "extract_web",
    sourceUrl: url,
    extract: async (deadline) => {
      const { sourceTitle, ...rest } = await extractFromWeb(url, deadline);
      return { ...rest, fields: { source_title: sourceTitle } };
    },
  };
}

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

  let route: Route;
  if (isYouTubeHost(url)) {
    // The pasted URL stops here: only the video ID and canonical URL go further.
    const video = parseYouTubeUrl(url);
    if (!video) return failure(raw, "blocked_url", "youtube");
    route = {
      source: "youtube",
      attemptKind: "extract_youtube",
      sourceUrl: video.canonicalUrl,
      extract: (routeDeadline) => extractFromYouTube(video, routeDeadline),
    };
  } else {
    route = webRoute(url);
  }
  const fail = (reason: ActionReason) => failure(raw, reason, route.source);

  let stage: PreAttemptStage = "auth";
  let attempt: Attempt | undefined;
  try {
    // Auth and the duplicate lookup share one 2 s budget; an abort here leaves no row.
    const preAttemptSignal = stepSignal(deadline, STEP_BUDGET_MS.authAndDedup);
    const user = await raceSignal(requireActionUser(), preAttemptSignal);
    if (!user.ok) return fail(user.reason);

    stage = "dedup";
    const supabase = await createSupabaseServerClient();
    const existing = await openExistingRecipe(
      supabase,
      route.source,
      route.sourceUrl,
      preAttemptSignal,
    );
    if (!existing.ok) {
      logPreAttemptFailure("dedup", host);
      return fail(existing.reason);
    }
    if (existing.recipeId) redirect(recipePath(existing.recipeId, true));

    stage = "reserve";
    const reserved = await reserveAttempt(
      supabase,
      route.attemptKind,
      route.sourceUrl,
    );
    if (!reserved.ok) {
      if (reserved.reason === "service_unavailable")
        logPreAttemptFailure("reserve", host);
      return fail(reserved.reason);
    }
    attempt = { supabase, attemptId: reserved.attemptId };

    const extraction = await route.extract(deadline);
    const { result, tokens } = extraction;
    const logLine = (outcome: string, reason: string | undefined) => {
      const line = {
        event: "extraction",
        kind: route.attemptKind,
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
      return fail(result.reason);
    }

    const saved = await saveRecipe(
      supabase,
      reserved.attemptId,
      user.userId,
      {
        title: result.recipe.title,
        extraction_method: result.method,
        ...extraction.fields,
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
      return fail(saved.reason);
    }

    logLine("recipe", saved.created ? undefined : "already_saved");
    redirect(recipePath(saved.recipeId, !saved.created));
  } catch (error) {
    // `redirect()` works by throwing; it must reach Next.js, not the catch all below.
    unstable_rethrow(error);

    if (!attempt) {
      logPreAttemptFailure(stage, host);
      return fail("service_unavailable");
    }
    console.error(
      JSON.stringify({
        event: "extraction",
        kind: route.attemptKind,
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
    return fail("internal_error");
  }
}
