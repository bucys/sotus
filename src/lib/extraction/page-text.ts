import type { HTMLElement } from "node-html-parser";

import { htmlToLines, type SkipElement } from "./html-to-lines.ts";

export const PAGE_TEXT_MIN = 300;
const TEXT_CAP = 60_000;
const HEAD_KEEP = 20_000;
const TAIL_KEEP = 40_000;

const STRIPPED_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "button",
]);

export type PageText = {
  readonly lines: readonly string[];
  readonly chars: number;
  readonly trimmed: boolean;
};

const tagOf = (element: HTMLElement) => element.rawTagName?.toLowerCase() ?? "";

const isStripped: SkipElement = (element) =>
  STRIPPED_TAGS.has(tagOf(element)) ||
  element.hasAttribute("hidden") ||
  element.getAttribute("aria-hidden") === "true";

function textLength(lines: readonly string[]): number {
  return lines.join("\n").length;
}

function insideSkipped(element: HTMLElement, skip: SkipElement): boolean {
  for (let node = element.parentNode; node; node = node.parentNode) {
    if (node.rawTagName && skip(node)) return true;
  }
  return false;
}

/** The first lines whose joined length stays within `limit`, cut on whole lines. */
function headWithin(
  lines: readonly string[],
  limit: number,
): readonly string[] {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const next = length + line.length + (kept.length > 0 ? 1 : 0);
    if (next > limit) break;
    kept.push(line);
    length = next;
  }
  return kept;
}

/**
 * Recipe cards often sit below a long story, so a page over 60,000 characters keeps its
 * first 20,000 and last 40,000, each cut back to whole lines, with one empty line between.
 */
function capLength(lines: readonly string[]): {
  readonly lines: readonly string[];
  readonly trimmed: boolean;
} {
  if (textLength(lines) <= TEXT_CAP) return { lines, trimmed: false };
  const head = headWithin(lines, HEAD_KEEP);
  const tail = headWithin(lines.toReversed(), TAIL_KEEP).toReversed();
  return { lines: [...head, "", ...tail], trimmed: true };
}

/** The page's visible main text as lines, ready for Gemini and for grounding. */
export function readPageText(root: HTMLElement): PageText {
  const body = root.querySelector("body") ?? root;
  const bodyLength = textLength(htmlToLines(body, isStripped));

  // A page wrapped in one big <form> (older ASP.NET sites) keeps its content.
  const removedForms = new Set(
    body
      .querySelectorAll("form")
      .filter((form) => !insideSkipped(form, isStripped))
      .filter(
        (form) => textLength(htmlToLines(form, isStripped)) < bodyLength / 2,
      ),
  );
  const skip: SkipElement = (element) =>
    isStripped(element) || removedForms.has(element);

  const remainingLength = textLength(htmlToLines(body, skip));
  const container =
    [body.querySelector("article"), body.querySelector("main")].find(
      (candidate): candidate is HTMLElement =>
        candidate !== null &&
        !insideSkipped(candidate, skip) &&
        textLength(htmlToLines(candidate, skip)) >= remainingLength / 2,
    ) ?? body;

  const capped = capLength(htmlToLines(container, skip));
  const text = capped.lines.join("\n");
  return { lines: capped.lines, chars: text.length, trimmed: capped.trimmed };
}
