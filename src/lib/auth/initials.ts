/** First letter of up to two words; "S" when there is nothing to use. */
export function getInitials(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "");
  const initials = letters.join("").toLocaleUpperCase();
  return initials || "S";
}
