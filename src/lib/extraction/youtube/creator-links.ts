import { tokensOf } from "../grounding.ts";
import { normalizeHost } from "../hosts.ts";
import { LINK_MAX_BYTES } from "../schemas.ts";

/** Hosts that never hold the creator's own recipe page; a subdomain counts as the host. */
const DENIED_HOSTS: readonly string[] = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "x.com",
  "twitter.com",
  "threads.net",
  "amzn.to",
  "patreon.com",
  "linktr.ee",
  "bit.ly",
  "geni.us",
  "spotify.com",
  "discord.gg",
];
/** `pinterest.*` and `amazon.*`: any country domain. */
const DENIED_LABELS: ReadonlySet<string> = new Set(["pinterest", "amazon"]);

export const CREATOR_LINKS_TRIED = 2;

/** Checked in, English: words that say nothing about which dish a title names. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  [
    "a",
    "an",
    "and",
    "the",
    "of",
    "or",
    "with",
    "without",
    "in",
    "on",
    "for",
    "to",
    "from",
    "my",
    "your",
    "our",
    "how",
    "make",
    "making",
    "recipe",
    "recipes",
    "easy",
    "best",
    "ever",
    "quick",
    "simple",
    "homemade",
    "perfect",
    "ultimate",
    "minute",
    "minutes",
    "video",
    "shorts",
  ].flatMap(tokensOf),
);

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

function isDenied(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (host.split(".").some((label) => DENIED_LABELS.has(label))) return true;
  return DENIED_HOSTS.some(
    (denied) => host === denied || host.endsWith(`.${denied}`),
  );
}

const hasPath = (url: URL) => url.pathname.split("/").some(Boolean);

/**
 * Candidate recipe page links from a description, best first: in order of appearance,
 * minus denied hosts and duplicates, with links that have a path ahead of home pages.
 */
export function creatorLinks(description: string): readonly string[] {
  const seen = new Set<string>();
  const links: URL[] = [];

  for (const match of description.matchAll(URL_IN_TEXT)) {
    let url: URL;
    try {
      url = new URL(match[0].replace(TRAILING_PUNCTUATION, ""));
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (new TextEncoder().encode(url.href).length > LINK_MAX_BYTES) continue;
    if (isDenied(url.hostname) || seen.has(url.href)) continue;
    seen.add(url.href);
    links.push(url);
  }

  return [
    ...links.filter(hasPath),
    ...links.filter((url) => !hasPath(url)),
  ].map((url) => url.href);
}

const titleTokens = (text: string) =>
  new Set(tokensOf(text).filter((token) => !STOP_WORDS.has(token)));

/** Whether a page's JSON-LD `name` and the video title share at least one dish word. */
export function sharesTitleWord(
  name: string | undefined,
  videoTitle: string,
): boolean {
  if (!name) return false;
  const video = titleTokens(videoTitle);
  return [...titleTokens(name)].some((token) => video.has(token));
}
