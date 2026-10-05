const PLACEHOLDER_ORIGIN = "http://sotus.invalid";
const MAX_LENGTH = 2048;
// Control characters are how `/\t/evil.com` style inputs smuggle a second slash past a parser.
const CONTROL_OR_BACKSLASH = /[\u0000-\u001F\u007F\\]/;

function hasSafeStart(value: string) {
  return (
    value.length <= MAX_LENGTH &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !CONTROL_OR_BACKSLASH.test(value)
  );
}

function isAuthPath(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "");
  return (
    normalized === "/sign-in" ||
    normalized.startsWith("/sign-in/") ||
    normalized === "/auth" ||
    normalized.startsWith("/auth/")
  );
}

function parse(value: string) {
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    return url.origin === PLACEHOLDER_ORIGIN ? url : undefined;
  } catch {
    return undefined;
  }
}

function isAuthPathAfterDecoding(pathname: string) {
  try {
    return isAuthPath(pathname) || isAuthPath(decodeURIComponent(pathname));
  } catch {
    return true;
  }
}

/**
 * Turns anything into a same site path, or "/" when it cannot be trusted.
 * Checked before and after URL normalization, because `/a/..//evil.example`
 * only becomes `//evil.example` once the dots are resolved.
 */
export function safeNextPath(input: unknown): string {
  if (typeof input !== "string" || !hasSafeStart(input)) return "/";

  const url = parse(input);
  if (!url) return "/";

  const { pathname } = url;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  if (pathname.includes("\\")) return "/";
  if (isAuthPathAfterDecoding(pathname)) return "/";

  const result = pathname + url.search + url.hash;
  if (!hasSafeStart(result) || !parse(result)) return "/";

  return result;
}
