import "server-only";

import { parseHtml } from "../parse-html";
import { readJsonLd } from "../read-jsonld";
import { safeFetch } from "../safe-fetch";
import type { AcceptedRecipe } from "../schemas";
import { readPageTitle } from "../titles";

import {
  CREATOR_LINKS_TRIED,
  creatorLinks,
  sharesTitleWord,
} from "./creator-links";

export type CreatorPageResult = {
  readonly found?: {
    readonly recipe: AcceptedRecipe;
    readonly recipePageUrl: string;
  };
  readonly log: {
    readonly links_tried: number;
    readonly links_failed: number;
    readonly links_off_topic: number;
  };
};

type LinkOutcome =
  | { readonly status: "failed" }
  | { readonly status: "off_topic" }
  | {
      readonly status: "recipe";
      readonly recipe: AcceptedRecipe;
      readonly link: string;
    };

async function readLink(
  link: string,
  videoTitle: string,
  signal: AbortSignal,
): Promise<LinkOutcome> {
  const fetched = await safeFetch(link, signal);
  if (!fetched.ok) return { status: "failed" };

  const root = parseHtml(fetched.html);
  if (!root) return { status: "failed" };
  const jsonLd = readJsonLd(root, readPageTitle(root));
  if (!jsonLd.found || jsonLd.multiple || !jsonLd.usable) {
    return { status: "failed" };
  }
  if (!sharesTitleWord(jsonLd.name, videoTitle)) return { status: "off_topic" };
  return { status: "recipe", recipe: jsonLd.recipe, link };
}

/**
 * Step 1 of the ladder: the creator's own recipe page, read from JSON-LD only. Every
 * failure here just moves the ladder on, so it is counted for the log, never returned.
 */
export async function readCreatorPage(
  description: string,
  videoTitle: string,
  signal: AbortSignal,
): Promise<CreatorPageResult> {
  const links = creatorLinks(description).slice(0, CREATOR_LINKS_TRIED);
  const outcomes = await Promise.all(
    links.map((link) =>
      readLink(link, videoTitle, signal).catch((): LinkOutcome => ({
        status: "failed",
      })),
    ),
  );

  const accepted = outcomes.find((outcome) => outcome.status === "recipe");
  return {
    found: accepted
      ? { recipe: accepted.recipe, recipePageUrl: accepted.link }
      : undefined,
    log: {
      links_tried: links.length,
      links_failed: outcomes.filter((outcome) => outcome.status === "failed")
        .length,
      links_off_topic: outcomes.filter(
        (outcome) => outcome.status === "off_topic",
      ).length,
    },
  };
}
