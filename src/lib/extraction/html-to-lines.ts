import { HTMLElement, TextNode, type Node } from "node-html-parser";

import { FIELD_DEPTH_LIMIT, parseHtml } from "./parse-html.ts";

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "li",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "dd",
  "dt",
  "blockquote",
  "pre",
  "figcaption",
  "ol",
  "ul",
]);

export type SkipElement = (element: HTMLElement) => boolean;

const keepAll: SkipElement = () => false;

function collect(node: Node, skip: SkipElement, parts: string[]): void {
  if (node instanceof TextNode) {
    parts.push(node.text);
    return;
  }
  if (!(node instanceof HTMLElement)) return;

  const tag = node.rawTagName?.toLowerCase() ?? "";
  if (tag === "br") {
    parts.push("\n");
    return;
  }
  if (tag !== "" && skip(node)) return;

  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock) parts.push("\n");
  for (const child of node.childNodes) collect(child, skip, parts);
  if (isBlock) parts.push("\n");
}

/**
 * Text of a parsed node as lines: a break at every `<br>` and around every block element,
 * entities decoded, whitespace collapsed within each line only, empty lines dropped.
 * Boundaries in the source never merge into one long line.
 */
export function htmlToLines(
  node: Node,
  skip: SkipElement = keepAll,
): readonly string[] {
  const parts: string[] = [];
  collect(node, skip, parts);
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");
}

/** For strings that may hold markup, such as JSON-LD fields. Pathological markup reads as empty. */
export function htmlStringToLines(html: string): readonly string[] {
  const root = parseHtml(html, FIELD_DEPTH_LIMIT);
  return root ? htmlToLines(root) : [];
}

export function htmlStringToLine(html: string): string {
  return htmlStringToLines(html).join(" ");
}
