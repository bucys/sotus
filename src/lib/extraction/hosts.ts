/** Lowercase, then remove one trailing dot: `YouTube.com.` → `youtube.com`. */
export function normalizeHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

export function isYouTubeHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  );
}

/** Never throws: the form calls it on half typed text. */
export function isYouTubeHost(url: string): boolean {
  try {
    return isYouTubeHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}
