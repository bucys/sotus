import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { classifyAuthResult } from "@/lib/auth/classify-auth-result";
import { classifyProviderError } from "@/lib/auth/messages";
import { signInPath } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { copyAuthResponseState } from "@/lib/supabase/copy-auth-response-state";
import type { Database } from "@/lib/supabase/database.types";
import { publishableKey, supabaseUrl } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));

  // Supabase writes cookies onto this carrier; every redirect copies from it,
  // so the session survives on the success and on every failure path.
  const carrier = NextResponse.next();
  const redirectTo = (path: string) =>
    copyAuthResponseState(carrier, NextResponse.redirect(`${origin}${path}`));
  const fail = (code: string) => redirectTo(signInPath(code, next));

  const providerError = searchParams.get("error");
  if (providerError) {
    return fail(
      classifyProviderError(providerError, searchParams.get("error_code")),
    );
  }

  const code = searchParams.get("code");
  if (!code) return fail("failed");

  const supabase = createServerClient<Database>(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          carrier.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          carrier.headers.set(key, value);
        }
      },
    },
  });

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);

    const status = classifyAuthResult({ user: undefined, error });
    return fail(status === "unavailable" ? "unavailable" : "failed");
  } catch {
    return fail("unavailable");
  }
}
