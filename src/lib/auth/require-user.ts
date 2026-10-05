import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { classifyAuthResult } from "@/lib/auth/classify-auth-result";
import { signInPath } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RequireUserResult =
  | { status: "signed_in"; userId: string }
  | { status: "signed_out" }
  | { status: "unavailable" };

/**
 * The guarantee at every protected server entry point. The proxy and layouts
 * only make navigation pleasant: they can be skipped, a Server Action never
 * passes through either. Cached per request, so repeat calls cost one check.
 */
export const requireUser = cache(async (): Promise<RequireUserResult> => {
  // Opts into request time rendering outside the try: Next signals "this cannot
  // be prerendered" by throwing, and the catch below would swallow it.
  await connection();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    const status = classifyAuthResult({ user: data.user, error });

    if (status === "signed_in" && data.user) {
      return { status, userId: data.user.id };
    }
    return status === "unavailable"
      ? { status: "unavailable" }
      : { status: "signed_out" };
  } catch {
    return { status: "unavailable" };
  }
});

export class AuthUnavailableError extends Error {
  constructor() {
    super("Could not check who is signed in");
    this.name = "AuthUnavailableError";
  }
}

/**
 * For pages, layouts and data reads: signed out redirects, unavailable throws
 * to the nearest error.tsx. Pass the page's own path so the person returns to it.
 */
export async function requirePageUser(nextPath?: string) {
  const result = await requireUser();
  if (result.status === "unavailable") throw new AuthUnavailableError();
  if (result.status === "signed_out") {
    redirect(signInPath(undefined, safeNextPath(nextPath)));
  }
  return result.userId;
}

export type ActionFailure = {
  ok: false;
  reason: "signed_out" | "unavailable";
};

/** For mutating Server Actions: a typed failure, never a redirect or a throw. */
export async function requireActionUser(): Promise<
  { ok: true; userId: string } | ActionFailure
> {
  const result = await requireUser();
  if (result.status === "signed_in") return { ok: true, userId: result.userId };
  return {
    ok: false,
    reason: result.status === "unavailable" ? "unavailable" : "signed_out",
  };
}
