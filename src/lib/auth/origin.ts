/**
 * Server Actions have no Request, so the return address comes from the Origin
 * header, accepted only when it points at the host that received the request.
 * x-forwarded-* headers are never trusted.
 */
export function validateActionOrigin(
  origin: string | null,
  host: string | null,
): string | undefined {
  if (!origin || !host) return undefined;

  try {
    const url = new URL(origin);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && url.host === host ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function signInPath(code: string | undefined, next: string) {
  const params = new URLSearchParams();
  if (code) params.set("error", code);
  if (next !== "/") params.set("next", next);
  const query = params.toString();
  return query ? `/sign-in?${query}` : "/sign-in";
}
