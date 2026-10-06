import { parse, type HTMLElement, type Node } from "node-html-parser";

/** Real recipe pages measure 15 to 26 levels deep; 256 leaves room for tag soup. */
export const PAGE_DEPTH_LIMIT = 256;
/** Markup inside a JSON-LD field is a few levels deep, and a page can hold thousands. */
export const FIELD_DEPTH_LIMIT = 32;

function deeperThan(root: Node, limit: number): boolean {
  const pending: { readonly node: Node; readonly depth: number }[] = [
    { node: root, depth: 0 },
  ];
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (next.depth > limit) return true;
    for (const child of next.node.childNodes) {
      pending.push({ node: child, depth: next.depth + 1 });
    }
  }
  return false;
}

/**
 * The one way to parse fetched or untrusted markup. `parse` cleans up every element left
 * open at the end in time that grows with the cube of their count (8,000 unclosed tags
 * block the event loop for tens of seconds, and no AbortSignal can stop synchronous
 * code), and deep trees overflow the stack of recursive walkers. Those open elements
 * always form one ancestor chain, so a first pass that skips the cleanup
 * (`parseNoneClosedTags`, linear) and measures depth bounds both. Returns `undefined`
 * when the markup is deeper than `maxDepth`; otherwise exactly what `parse` returns.
 */
export function parseHtml(
  html: string,
  maxDepth: number = PAGE_DEPTH_LIMIT,
): HTMLElement | undefined {
  const raw = parse(html, { parseNoneClosedTags: true });
  if (deeperThan(raw, maxDepth)) return undefined;
  return parse(html);
}
