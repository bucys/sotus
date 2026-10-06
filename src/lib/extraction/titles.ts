import type { HTMLElement } from "node-html-parser";

import { htmlToLines } from "./html-to-lines.ts";

export const TITLE_MAX = 120;
export const SOURCE_TITLE_MAX = 300;

/** Postgres `char_length` counts code points, so every length here does too. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

function blankToUndefined(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

/** `og:title`, else `<title>`, as one line; absent when blank. Not yet cut. */
export function readPageTitle(root: HTMLElement): string | undefined {
  const ogTitle = blankToUndefined(
    root.querySelector('meta[property="og:title"]')?.getAttribute("content"),
  );
  if (ogTitle) return ogTitle;

  const titleElement = root.querySelector("title");
  return titleElement
    ? blankToUndefined(htmlToLines(titleElement).join(" "))
    : undefined;
}

export function toSourceTitle(
  pageTitle: string | undefined,
): string | undefined {
  if (!pageTitle) return undefined;
  return blankToUndefined(
    Array.from(pageTitle).slice(0, SOURCE_TITLE_MAX).join(""),
  );
}

const SITE_SEPARATORS = [" | ", " - ", " – ", " — "] as const;

/** `Fluffy Pancakes | Serious Eats` → `Fluffy Pancakes`, unless nothing would be left. */
export function stripSiteSuffix(pageTitle: string): string {
  const cut = Math.max(
    ...SITE_SEPARATORS.map((separator) => pageTitle.lastIndexOf(separator)),
  );
  if (cut < 0) return pageTitle;
  const left = pageTitle.slice(0, cut).trim();
  return left ? left : pageTitle;
}

/** Cut at the last space at or before 120 code points; a hard cut when there is none. */
export function cutTitle(title: string): string {
  const points = Array.from(title);
  if (points.length <= TITLE_MAX) return title;

  const window = points.slice(0, TITLE_MAX + 1);
  const lastSpace = window.lastIndexOf(" ");
  const end = lastSpace > 0 ? lastSpace : TITLE_MAX;
  return points.slice(0, end).join("").trimEnd();
}

/**
 * The first candidate that is not blank, cut to the title limit. Candidates come in
 * spec order: JSON-LD `name`, extracted title, page title without its site suffix.
 */
export function chooseTitle(
  candidates: readonly (string | undefined)[],
): string | undefined {
  for (const candidate of candidates) {
    const usable = blankToUndefined(candidate);
    if (usable) return cutTitle(usable);
  }
  return undefined;
}

export function pageTitleFallback(
  pageTitle: string | undefined,
): string | undefined {
  return pageTitle ? stripSiteSuffix(pageTitle) : undefined;
}
