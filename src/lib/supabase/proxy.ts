import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  classifyAuthResult,
  type AuthStatus,
} from "@/lib/auth/classify-auth-result";
import { signInPath } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { copyAuthResponseState } from "./copy-auth-response-state";
import type { Database } from "./database.types";
import { publishableKey, supabaseUrl } from "./env";

const PUBLIC_PATHS = new Set(["/sign-in", "/auth/callback"]);

function isNavigation(request: NextRequest) {
  return request.method === "GET" || request.method === "HEAD";
}

function nextFor(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.search);
  params.delete("_rsc");
  const search = params.toString();
  return safeNextPath(request.nextUrl.pathname + (search ? `?${search}` : ""));
}

/**
 * Refreshes the session cookie, then does the navigation help: a verified signed
 * out GET goes to /sign-in, a signed in GET to /sign-in goes on to where it was
 * headed. This is not the security guarantee (requireUser() is), so it never
 * redirects a mutation and never acts on an answer it could not get.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const status = await readStatus(supabase);
  const redirectTo = redirectTarget(request, status);
  if (!redirectTo) return response;

  return copyAuthResponseState(
    response,
    NextResponse.redirect(new URL(redirectTo, request.url)),
  );
}

async function readStatus(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<AuthStatus> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    return classifyAuthResult({ user: data?.claims, error });
  } catch {
    return "unavailable";
  }
}

function redirectTarget(request: NextRequest, status: AuthStatus) {
  if (status === "unavailable" || !isNavigation(request)) return undefined;

  const { pathname } = request.nextUrl;
  if (status === "signed_out" && !PUBLIC_PATHS.has(pathname)) {
    return signInPath(undefined, nextFor(request));
  }
  if (status === "signed_in" && pathname === "/sign-in") {
    return safeNextPath(request.nextUrl.searchParams.get("next"));
  }
  return undefined;
}
