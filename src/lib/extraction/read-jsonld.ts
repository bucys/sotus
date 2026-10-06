import type { HTMLElement } from "node-html-parser";

import { htmlStringToLine, htmlStringToLines } from "./html-to-lines.ts";
import { parseIngredientLine } from "./parse-ingredient-line.ts";
import { acceptedRecipeSchema, type AcceptedRecipe } from "./schemas.ts";
import { stripEnumeration } from "./step-text.ts";
import { chooseTitle, pageTitleFallback } from "./titles.ts";

export type JsonLdResult =
  | { readonly found: false }
  | { readonly found: true; readonly multiple: true }
  | {
      readonly found: true;
      readonly multiple?: false;
      readonly usable: false;
      readonly why: string;
      readonly name?: string;
    }
  | {
      readonly found: true;
      readonly multiple?: false;
      readonly usable: true;
      readonly recipe: AcceptedRecipe;
    };

type JsonObject = { readonly [key: string]: unknown };

type RecipeNode = {
  readonly name: string;
  readonly ingredientLines: readonly string[];
  readonly steps: readonly string[];
};

const RECIPE_TYPES: ReadonlySet<string> = new Set([
  "recipe",
  "https://schema.org/recipe",
  "http://schema.org/recipe",
]);

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasType(node: JsonObject, wanted: ReadonlySet<string>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (entry) => typeof entry === "string" && wanted.has(entry.toLowerCase()),
  );
}

const HOW_TO_STEP: ReadonlySet<string> = new Set([
  "howtostep",
  "https://schema.org/howtostep",
  "http://schema.org/howtostep",
]);
const STEP_CONTAINERS: ReadonlySet<string> = new Set([
  "howtosection",
  "itemlist",
  "https://schema.org/howtosection",
  "http://schema.org/howtosection",
]);

/** Raw script text, cleaned just enough for the faults recipe plugins commonly emit. */
function parseScript(raw: string): unknown {
  const body = raw
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .trim()
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    // Raw newlines inside JSON strings are invalid, and WordPress plugins emit them.
    .replace(/[\u0000-\u001F]/g, " ");
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function collectRecipeNodes(value: unknown, found: JsonObject[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRecipeNodes(item, found);
    return;
  }
  if (!isObject(value)) return;

  if (hasType(value, RECIPE_TYPES)) found.push(value);
  if (Array.isArray(value["@graph"]))
    collectRecipeNodes(value["@graph"], found);
  if (value.mainEntity !== undefined)
    collectRecipeNodes(value.mainEntity, found);
}

function readIngredientLines(node: JsonObject): readonly string[] {
  const source = node.recipeIngredient ?? node.ingredients;
  const items = Array.isArray(source) ? source : [source];
  return items
    .filter((item): item is string => typeof item === "string")
    .map(htmlStringToLine)
    .filter((line) => line !== "");
}

function flattenInstructions(value: unknown): readonly string[] {
  if (typeof value === "string") return htmlStringToLines(value);
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (!isObject(value)) return [];

  if (hasType(value, HOW_TO_STEP)) {
    const text = typeof value.text === "string" ? value.text : value.name;
    return typeof text === "string" ? htmlStringToLines(text) : [];
  }
  if (hasType(value, STEP_CONTAINERS)) {
    return flattenInstructions(value.itemListElement);
  }
  return [];
}

function toRecipeNode(node: JsonObject): RecipeNode {
  return {
    name: typeof node.name === "string" ? htmlStringToLine(node.name) : "",
    ingredientLines: readIngredientLines(node),
    steps: flattenInstructions(node.recipeInstructions)
      .map(stripEnumeration)
      .filter((step) => step !== ""),
  };
}

const isComplete = (node: RecipeNode) =>
  node.ingredientLines.length > 0 && node.steps.length > 0;

function sameRecipe(a: RecipeNode, b: RecipeNode): boolean {
  return (
    a.name.toLowerCase() === b.name.toLowerCase() &&
    a.ingredientLines.length === b.ingredientLines.length &&
    a.ingredientLines.every((line, index) => line === b.ingredientLines[index])
  );
}

function describeFailure(error: {
  readonly issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[];
}): string {
  const issue = error.issues[0];
  if (!issue) return "invalid";
  const path = issue.path.filter((part) => typeof part === "string").join(".");
  return `${path || "recipe"}:${issue.message}`.slice(0, 60);
}

/**
 * Reads the schema.org `Recipe` a page publishes as JSON-LD. Sotus never picks one of
 * several distinct recipes, and never saves a recipe that fails the contract in part.
 * Pass the page title so a recipe without a `name` can still be titled.
 */
export function readJsonLd(
  root: HTMLElement,
  pageTitle?: string,
): JsonLdResult {
  const scripts = root
    .querySelectorAll("script")
    .filter(
      (script) =>
        script.getAttribute("type")?.trim().toLowerCase() ===
        "application/ld+json",
    );

  const nodes: JsonObject[] = [];
  for (const script of scripts) {
    const parsed = parseScript(script.rawText);
    if (parsed !== undefined) collectRecipeNodes(parsed, nodes);
  }
  if (nodes.length === 0) return { found: false };

  const all = nodes.map(toRecipeNode);
  const complete = all.filter(isComplete);
  const distinct = complete.filter(
    (node, index) =>
      complete.findIndex((other) => sameRecipe(node, other)) === index,
  );

  if (distinct.length > 1) return { found: true, multiple: true };

  const recipe = distinct[0];
  if (!recipe) {
    const name = all.find((node) => node.name)?.name;
    return { found: true, usable: false, why: "incomplete", name };
  }

  const name = recipe.name || undefined;
  const title = chooseTitle([name, pageTitleFallback(pageTitle)]);
  if (!title) return { found: true, usable: false, why: "missing_title" };

  const parsed = acceptedRecipeSchema.safeParse({
    title,
    ingredients: recipe.ingredientLines.map(parseIngredientLine),
    steps: recipe.steps,
  });

  return parsed.success
    ? { found: true, usable: true, recipe: parsed.data }
    : { found: true, usable: false, why: describeFailure(parsed.error), name };
}
