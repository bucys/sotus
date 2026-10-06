import { QUANTITY_SOURCE, normalizeFractions } from "./numbers.ts";
import { codePointLength } from "./titles.ts";

export const UNITS = [
  "cup",
  "cups",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "tbs",
  "teaspoon",
  "teaspoons",
  "tsp",
  "g",
  "gram",
  "grams",
  "kg",
  "mg",
  "ml",
  "millilitre",
  "milliliter",
  "l",
  "litre",
  "liter",
  "dl",
  "cl",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "pinch",
  "dash",
  "clove",
  "cloves",
  "can",
  "cans",
  "stick",
  "sticks",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "bunch",
  "handful",
  "package",
  "packet",
  "pint",
  "pints",
  "quart",
  "quarts",
] as const;

const TWO_WORD_UNITS = ["fluid ounces", "fluid ounce", "fl oz"] as const;

const QUANTITY_MAX = 40;
const UNIT_MAX = 20;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Longest phrase first: two word units before any single word, then `cups` before `cup`.
const UNIT_ALTERNATIVES = [
  ...TWO_WORD_UNITS,
  ...UNITS.toSorted((a, b) => b.length - a.length),
]
  .map((unit) => escape(unit).replace(" ", "\\s+"))
  .join("|");

const QUANTITY_PATTERN = new RegExp(`^(${QUANTITY_SOURCE})`);
const UNIT_PATTERN = new RegExp(
  `^\\s*(${UNIT_ALTERNATIVES})\\.?(?=\\s|$|[,;:)])`,
  "i",
);

export type ParsedIngredient = {
  readonly name: string;
  readonly quantity?: string;
  readonly unit?: string;
};

function wholeLine(line: string): ParsedIngredient {
  return { name: line };
}

/** Splits one cleaned ingredient line into quantity, unit and name. Never guesses. */
export function parseIngredientLine(rawLine: string): ParsedIngredient {
  const line = normalizeFractions(rawLine).replace(/\s+/g, " ").trim();

  const quantityMatch = QUANTITY_PATTERN.exec(line);
  if (!quantityMatch?.[1]) return wholeLine(line);

  const quantity = quantityMatch[1];
  let rest = line.slice(quantity.length);

  const unitMatch = UNIT_PATTERN.exec(rest);
  const unit = unitMatch?.[1]?.replace(/\s+/g, " ");
  if (unitMatch) {
    rest = rest.slice(unitMatch[0].length);
  } else if (rest !== "" && !/^\s/.test(rest)) {
    // `12-inch tortillas`: a number glued to an unknown word is not a quantity.
    return wholeLine(line);
  }

  const name = rest
    .trim()
    .replace(/^of\s+/i, "")
    .trim();

  if (
    name === "" ||
    codePointLength(quantity) > QUANTITY_MAX ||
    (unit !== undefined && codePointLength(unit) > UNIT_MAX)
  ) {
    return wholeLine(line);
  }

  return unit ? { name, quantity, unit } : { name, quantity };
}
