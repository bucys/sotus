import { z } from "zod";

import { codePointLength } from "./titles.ts";

export const LINK_MAX_BYTES = 2048;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The pasted link: trimmed, at most 2048 UTF-8 bytes, a valid `http` or `https` URL. */
export const linkInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((text) => byteLength(text) <= LINK_MAX_BYTES)
  .refine(isHttpUrl);

const LIMITS = {
  title: 120,
  name: 120,
  quantity: 40,
  unit: 20,
  step: 1000,
  ingredients: 60,
  steps: 40,
} as const;

// Lengths count code points, as Postgres `char_length` does in `save_recipe`.
const text = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => codePointLength(value) <= max, `at most ${max}`);

const filledText = (max: number) =>
  text(max).refine((value) => value !== "", "blank");

const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const ingredientSchema = z.object({
  name: filledText(LIMITS.name),
  quantity: optionalText(LIMITS.quantity),
  unit: optionalText(LIMITS.unit),
});

/** Types and per field limits only, no counts: the model output is grounded before counting. */
export const modelFieldsSchema = z.object({
  title: text(LIMITS.title).optional(),
  ingredients: z.array(ingredientSchema).max(LIMITS.ingredients),
  steps: z.array(filledText(LIMITS.step)).max(LIMITS.steps),
});

/** The acceptance rules (0001): limits plus counts. Everything saved passes this. */
export const acceptedRecipeSchema = z.object({
  title: filledText(LIMITS.title),
  ingredients: z.array(ingredientSchema).min(2).max(LIMITS.ingredients),
  steps: z.array(filledText(LIMITS.step)).min(1).max(LIMITS.steps),
});

export type AcceptedRecipe = z.infer<typeof acceptedRecipeSchema>;
export type ModelFields = z.infer<typeof modelFieldsSchema>;

/**
 * What Gemini answers with. Kept inside the JSON Schema subset Gemini supports: objects,
 * arrays, strings, enums, `required` and `description`, no limits (0001 *Schemas*).
 */
export const providerResponseSchema = z.object({
  outcome: z
    .enum(["recipe", "not_a_recipe", "insufficient"])
    .describe("recipe only when the text states ingredients and steps"),
  reason: z
    .string()
    .optional()
    .describe(
      "only when outcome is insufficient: missing_ingredients, missing_steps or multiple_recipes",
    ),
  title: z.string().optional().describe("the recipe name as written"),
  ingredients: z
    .array(
      z.object({
        name: z.string().describe("copied exactly as written"),
        quantity: z
          .string()
          .optional()
          .describe("only when the text states it"),
        unit: z.string().optional().describe("only when the text states it"),
      }),
    )
    .optional(),
  steps: z.array(z.string()).optional().describe("the method, in order"),
});

export type ProviderResponse = z.infer<typeof providerResponseSchema>;

function stripUnsupported(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupported);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "$schema" && key !== "additionalProperties")
      .map(([key, entry]) => [key, stripUnsupported(entry)]),
  );
}

export const providerResponseJsonSchema = stripUnsupported(
  z.toJSONSchema(providerResponseSchema),
);
