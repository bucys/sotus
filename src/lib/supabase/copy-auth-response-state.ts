import type { NextResponse } from "next/server";

const CACHE_HEADERS = ["Cache-Control", "Expires", "Pragma"] as const;

/**
 * A redirect built after Supabase wrote its cookies would silently drop them.
 * This carries the refreshed cookies and the no-store headers over, so a CDN
 * never caches a response that holds someone's session.
 */
export function copyAuthResponseState(from: NextResponse, to: NextResponse) {
  const cookies = from.cookies.getAll();
  for (const cookie of cookies) {
    to.cookies.set(cookie);
  }

  for (const name of CACHE_HEADERS) {
    const value = from.headers.get(name);
    if (value) to.headers.set(name, value);
  }

  if (cookies.length > 0 && !to.headers.has("Cache-Control")) {
    to.headers.set("Cache-Control", "private, no-store");
  }

  return to;
}
