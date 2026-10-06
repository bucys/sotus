import type { AttemptReason } from "@/lib/ai/attempt-reasons";
import type { Database } from "@/lib/supabase/database.types";

import { ground } from "./grounding.ts";
import {
  acceptedRecipeSchema,
  modelFieldsSchema,
  type AcceptedRecipe,
  type ProviderResponse,
} from "./schemas.ts";
import { chooseTitle, cutTitle } from "./titles.ts";

export type ExtractionMethod = Database["public"]["Enums"]["extraction_method"];

/** Every extraction, from any source, ends in exactly one of these (0001). */
export type ExtractionOutcome =
  | {
      readonly outcome: "recipe";
      readonly recipe: AcceptedRecipe;
      readonly method: ExtractionMethod;
    }
  | {
      readonly outcome: "not_a_recipe" | "insufficient" | "ingestion_failed";
      readonly reason: AttemptReason;
    };

export type FailedOutcome = Extract<
  ExtractionOutcome,
  { readonly reason: AttemptReason }
>;

export const failed = (
  outcome: FailedOutcome["outcome"],
  reason: AttemptReason,
): FailedOutcome => ({ outcome, reason });

const MODEL_INSUFFICIENT_REASONS: ReadonlySet<string> = new Set([
  "missing_ingredients",
  "missing_steps",
  "multiple_recipes",
]);

export type ModelAcceptance = {
  readonly result: ExtractionOutcome;
  readonly droppedIngredients: number;
  readonly clearedAmounts: number;
};

type AcceptOptions = {
  readonly method: ExtractionMethod;
  /** Grounding source: page title plus page text, as lines. */
  readonly sourceLines: readonly string[];
  /** Title candidates around the extracted title, in spec order. */
  readonly titleBefore?: string;
  readonly titleAfter?: string;
};

const countReason = (ingredients: number): AttemptReason =>
  ingredients < 2 ? "missing_ingredients" : "missing_steps";

/**
 * The order matters (0006 AC-8): field limits first, then grounding, then the counts.
 * A reply with one ingredient is `insufficient`, never `invalid_model_output`.
 */
export function acceptModelResponse(
  response: ProviderResponse,
  options: AcceptOptions,
): ModelAcceptance {
  const none = { droppedIngredients: 0, clearedAmounts: 0 };

  if (response.outcome === "not_a_recipe") {
    return { result: failed("not_a_recipe", "not_a_recipe"), ...none };
  }
  if (response.outcome === "insufficient") {
    const reason =
      response.reason && MODEL_INSUFFICIENT_REASONS.has(response.reason)
        ? (response.reason as AttemptReason)
        : countReason(response.ingredients?.length ?? 0);
    return { result: failed("insufficient", reason), ...none };
  }

  const fields = modelFieldsSchema.safeParse({
    title: response.title ? cutTitle(response.title.trim()) : undefined,
    ingredients: (response.ingredients ?? []).filter(
      (ingredient) => ingredient.name.trim() !== "",
    ),
    steps: (response.steps ?? []).filter((step) => step.trim() !== ""),
  });
  if (!fields.success) {
    return {
      result: failed("ingestion_failed", "invalid_model_output"),
      ...none,
    };
  }

  const grounded = ground(fields.data, options.sourceLines);
  const drops = {
    droppedIngredients: grounded.droppedIngredients,
    clearedAmounts: grounded.clearedAmounts,
  };
  if (!grounded.grounded) {
    return { result: failed("insufficient", grounded.reason), ...drops };
  }

  if (grounded.ingredients.length < 2 || grounded.steps.length === 0) {
    return {
      result: failed("insufficient", countReason(grounded.ingredients.length)),
      ...drops,
    };
  }

  const title = chooseTitle([
    options.titleBefore,
    fields.data.title,
    options.titleAfter,
  ]);
  if (!title)
    return { result: failed("insufficient", "missing_title"), ...drops };

  const accepted = acceptedRecipeSchema.safeParse({
    title,
    ingredients: grounded.ingredients,
    steps: grounded.steps,
  });
  if (!accepted.success) {
    return {
      result: failed("ingestion_failed", "invalid_model_output"),
      ...drops,
    };
  }
  return {
    result: {
      outcome: "recipe",
      recipe: accepted.data,
      method: options.method,
    },
    ...drops,
  };
}
