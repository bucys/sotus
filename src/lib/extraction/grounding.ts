import { normalizeFractions, readNumbers, sameNumber } from "./numbers.ts";
import { stripEnumeration } from "./step-text.ts";

type Ingredient = {
  readonly name: string;
  readonly quantity?: string;
  readonly unit?: string;
};

export type GroundingInput = {
  readonly ingredients: readonly Ingredient[];
  readonly steps: readonly string[];
};

export type GroundingResult =
  | {
      readonly grounded: true;
      readonly ingredients: readonly Ingredient[];
      readonly steps: readonly string[];
      readonly droppedIngredients: number;
      readonly clearedAmounts: number;
    }
  | {
      readonly grounded: false;
      readonly reason: "ungrounded_step";
      readonly droppedIngredients: number;
      readonly clearedAmounts: number;
    };

type Segment = {
  readonly tokens: ReadonlySet<string>;
  readonly numbers: readonly number[];
};

const URLS = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const HASHTAGS = /#[\p{L}\p{N}_]+/gu;
const TIMESTAMP_LINE = /^\s*\(?\d{1,2}:\d{2}(?::\d{2})?\)?/;

/** English plural to singular, the same function for source and output (0002). */
export function singular(word: string): string {
  if (Array.from(word).length < 4) return word;
  if (/(?:s|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (/[^sui]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function normalize(text: string): string {
  return normalizeFractions(normalizeFractions(text).normalize("NFKC"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole words of letters; accented letters stay inside their word. */
export function tokensOf(text: string): readonly string[] {
  return Array.from(normalize(text).matchAll(/\p{L}+/gu), (match) =>
    singular(match[0]),
  );
}

/** Lines of the source after removing URLs, hashtags and timestamp lines. */
export function cleanSource(lines: readonly string[]): readonly string[] {
  return lines
    .filter((line) => !TIMESTAMP_LINE.test(line))
    .map((line) => normalize(line.replace(URLS, " ").replace(HASHTAGS, " ")))
    .filter((line) => line !== "");
}

const hasNumber = (numbers: readonly number[], value: number) =>
  numbers.some((candidate) => sameNumber(candidate, value));

function amountGrounded(
  ingredient: Ingredient,
  headWord: string | undefined,
  segments: readonly Segment[],
): boolean {
  if (!headWord) return false;
  const quantity = ingredient.quantity ?? "";
  const quantityNumbers = readNumbers(quantity);
  // A quantity with no number (`a few`) must then appear word for word.
  const quantityWords = quantityNumbers.length === 0 ? tokensOf(quantity) : [];
  const unitWords = tokensOf(ingredient.unit ?? "");

  return segments.some(
    (segment) =>
      segment.tokens.has(headWord) &&
      quantityNumbers.every((value) => hasNumber(segment.numbers, value)) &&
      quantityWords.every((word) => segment.tokens.has(word)) &&
      unitWords.every((word) => segment.tokens.has(word)),
  );
}

/**
 * Keeps only what the source states (0002 *Grounding*): an ingredient whose name is not
 * in the source is dropped, an amount not stated beside its ingredient is cleared, and
 * a step with an unstated number or a dropped ingredient rejects the whole result.
 */
export function ground(
  output: GroundingInput,
  sourceLines: readonly string[],
): GroundingResult {
  const segments: readonly Segment[] = cleanSource(sourceLines).map((line) => ({
    tokens: new Set(tokensOf(line)),
    numbers: readNumbers(line),
  }));
  const sourceTokens = new Set(
    segments.flatMap((segment) => [...segment.tokens]),
  );
  const sourceNumbers = segments.flatMap((segment) => segment.numbers);

  const droppedHeads: string[] = [];
  const kept: Ingredient[] = [];
  let clearedAmounts = 0;

  for (const ingredient of output.ingredients) {
    const tokens = tokensOf(ingredient.name);
    const headWord = tokens.at(-1);
    const named = tokens
      .filter((token) => Array.from(token).length >= 3)
      .every((token) => sourceTokens.has(token));

    if (!named) {
      if (headWord) droppedHeads.push(headWord);
      continue;
    }

    const hasAmount = Boolean(ingredient.quantity || ingredient.unit);
    if (hasAmount && !amountGrounded(ingredient, headWord, segments)) {
      clearedAmounts += 1;
      kept.push({ name: ingredient.name });
    } else {
      kept.push(ingredient);
    }
  }

  const droppedIngredients = output.ingredients.length - kept.length;
  const steps = output.steps
    .map(stripEnumeration)
    .filter((step) => step !== "");

  const stepUngrounded = steps.some((step) => {
    const stepTokens = new Set(tokensOf(step));
    return (
      readNumbers(step).some((value) => !hasNumber(sourceNumbers, value)) ||
      droppedHeads.some((head) => stepTokens.has(head))
    );
  });

  if (stepUngrounded) {
    return {
      grounded: false,
      reason: "ungrounded_step",
      droppedIngredients,
      clearedAmounts,
    };
  }
  return {
    grounded: true,
    ingredients: kept,
    steps,
    droppedIngredients,
    clearedAmounts,
  };
}
