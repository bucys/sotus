import "server-only";

import { createHmac } from "node:crypto";

import type { Database } from "@/lib/supabase/database.types";

function readPublishSecret(value: string | undefined) {
  if (!value) {
    throw new Error(
      "Missing environment variable RECIPE_PUBLISH_SECRET. Copy .env.example to .env.local and fill it in.",
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      "RECIPE_PUBLISH_SECRET must be 32 random bytes as hex (openssl rand -hex 32).",
    );
  }
  return value;
}

const publishSecret = readPublishSecret(process.env.RECIPE_PUBLISH_SECRET);

type ExtractionMethod = Database["public"]["Enums"]["extraction_method"];

/** The content `save_recipe` accepts. Attribution and source come from the database. */
export type RecipePayload = {
  readonly title: string;
  readonly extraction_method: ExtractionMethod;
  readonly recipe_page_url?: string;
  readonly source_title?: string;
  readonly source_channel_title?: string;
  readonly ingredients: readonly {
    readonly name: string;
    readonly quantity?: string;
    readonly unit?: string;
  }[];
  readonly steps: readonly string[];
};

/** The payload fields that describe where a recipe came from, set by each source. */
export type RecipeSourceFields = Pick<
  RecipePayload,
  "source_title" | "source_channel_title" | "recipe_page_url"
>;

export type SignedRecipe = {
  readonly payload: string;
  readonly signature: string;
};

/**
 * `save_recipe` recomputes this HMAC in Postgres from the same three parts, so the
 * caller must send `payload` exactly as returned: the bytes signed are the bytes sent.
 */
export function signRecipePayload(
  attemptId: string,
  userId: string,
  recipe: RecipePayload,
): SignedRecipe {
  const payload = JSON.stringify(recipe);
  const signature = createHmac("sha256", publishSecret)
    .update(`${attemptId}:${userId}:${payload}`, "utf8")
    .digest("hex");
  return { payload, signature };
}
