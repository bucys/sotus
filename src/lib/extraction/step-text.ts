// `1.5 cups` must keep its number, so the punctuation has to be followed by a space or the end.
const ENUMERATION = /^\s*(?:step\s*\d+\s*[.:)\-–]?|\d+\s*[.:)](?=\s|$))\s*/i;

/** Removes a leading `1.` or `Step 2:` from a step. */
export function stripEnumeration(step: string): string {
  return step.replace(ENUMERATION, "").trim();
}
