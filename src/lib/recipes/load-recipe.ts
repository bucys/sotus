import "server-only";

import { cache } from "react";

import { requirePageUser } from "@/lib/auth/require-user";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExtractionMethod = Database["public"]["Enums"]["extraction_method"];

export type RecipeVideo = {
  readonly videoId: string;
  readonly title: string | null;
  readonly channelTitle: string | null;
};

export type RecipeView = {
  readonly title: string;
  readonly sourceUrl: string;
  readonly extractionMethod: ExtractionMethod;
  /** Present exactly for a YouTube recipe. */
  readonly video?: RecipeVideo;
  readonly ingredients: readonly {
    readonly name: string;
    readonly quantity: string | null;
    readonly unit: string | null;
  }[];
  readonly steps: readonly string[];
};

export type LoadRecipeResult =
  | { readonly status: "found"; readonly recipe: RecipeView }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" };

/**
 * Shared by `generateMetadata` and the page, so the query runs once per request.
 * Auth is checked here, before any read, instead of trusting the layout or the proxy.
 */
export const loadRecipe = cache(
  async (id: string): Promise<LoadRecipeResult> => {
    const user = await requirePageUser(`/recipes/${id}`);
    if (user.status === "unavailable") return { status: "unavailable" };
    if (!UUID.test(id)) return { status: "not_found" };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "title, source_url, source_kind, extraction_method, youtube_video_id, source_title, source_channel_title, recipe_ingredients(position, name, quantity, unit), recipe_steps(position, body)",
      )
      .eq("id", id)
      .order("position", { referencedTable: "recipe_ingredients" })
      .order("position", { referencedTable: "recipe_steps" })
      .maybeSingle();

    if (error) throw new Error(`Could not load recipe: ${error.message}`);
    if (!data) return { status: "not_found" };

    return {
      status: "found",
      recipe: {
        title: data.title,
        sourceUrl: data.source_url,
        extractionMethod: data.extraction_method,
        video:
          data.source_kind === "youtube" && data.youtube_video_id
            ? {
                videoId: data.youtube_video_id,
                title: data.source_title,
                channelTitle: data.source_channel_title,
              }
            : undefined,
        ingredients: data.recipe_ingredients.map(
          ({ name, quantity, unit }) => ({
            name,
            quantity,
            unit,
          }),
        ),
        steps: data.recipe_steps.map((step) => step.body),
      },
    };
  },
);

/** `www.example.com` → `example.com`; punycode is shown as stored. */
export function sourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

/** The non empty parts of quantity, unit and name, joined by single spaces. */
export function ingredientAmount(
  ingredient: RecipeView["ingredients"][number],
): string {
  return [ingredient.quantity, ingredient.unit]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

const PROVENANCE: Readonly<Record<ExtractionMethod, string | undefined>> = {
  web_jsonld: undefined,
  web_model: undefined,
  youtube_recipe_page_jsonld: "From the creator's recipe page",
  youtube_description: "From the video description",
  youtube_transcript: "From what the video says",
};

/** The "From …" line: where a YouTube recipe was read from, else the web page's host. */
export function provenanceLine(recipe: RecipeView): string {
  return (
    PROVENANCE[recipe.extractionMethod] ??
    `From ${sourceHost(recipe.sourceUrl)}`
  );
}
