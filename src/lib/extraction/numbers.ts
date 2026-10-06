const VULGAR_FRACTIONS: ReadonlyMap<string, string> = new Map([
  ["½", "1/2"],
  ["⅓", "1/3"],
  ["⅔", "2/3"],
  ["¼", "1/4"],
  ["¾", "3/4"],
  ["⅕", "1/5"],
  ["⅖", "2/5"],
  ["⅗", "3/5"],
  ["⅘", "4/5"],
  ["⅙", "1/6"],
  ["⅚", "5/6"],
  ["⅛", "1/8"],
  ["⅜", "3/8"],
  ["⅝", "5/8"],
  ["⅞", "7/8"],
]);

const VULGAR_PATTERN = /(?:(\d) ?)?([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g;

/** `½` → `1/2`, `1½` → `1 1/2`, and the fraction slash `1⁄2` → `1/2`. */
export function normalizeFractions(text: string): string {
  return text
    .replace(/(\d)⁄(\d)/g, "$1/$2")
    .replace(
      VULGAR_PATTERN,
      (_match, whole: string | undefined, glyph: string) => {
        const fraction = VULGAR_FRACTIONS.get(glyph) ?? glyph;
        return whole ? `${whole} ${fraction}` : fraction;
      },
    );
}

/** One number as written: a mixed number, a fraction, a decimal with `.` or `,`, or an integer. */
export const NUMBER_SOURCE = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;

/** A number, or a range of two (`2-3`, `2–3`, `2 to 3`). */
export const QUANTITY_SOURCE = String.raw`${NUMBER_SOURCE}(?:\s*[-–]\s*${NUMBER_SOURCE}|\s+to\s+${NUMBER_SOURCE})?`;

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ["half", 0.5],
  ["quarter", 0.25],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
]);

function valueOf(written: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(written);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(written);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(written.replace(",", "."));
}

/**
 * Every number in the text, by value, so `1/2`, `½`, `0.5` and `half` compare equal.
 * A range gives its two ends as two numbers.
 */
export function readNumbers(text: string): readonly number[] {
  const normalized = normalizeFractions(text.toLowerCase());
  const pattern = new RegExp(String.raw`${NUMBER_SOURCE}|\p{L}+`, "gu");
  const values: number[] = [];
  for (const match of normalized.matchAll(pattern)) {
    const token = match[0];
    if (/^\d/.test(token)) {
      const value = valueOf(token);
      if (Number.isFinite(value)) values.push(value);
    } else {
      const word = NUMBER_WORDS.get(token);
      if (word !== undefined) values.push(word);
    }
  }
  return values;
}

export function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
