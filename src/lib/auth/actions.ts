"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { classifyAuthResult } from "@/lib/auth/classify-auth-result";
import { signInPath, validateActionOrigin } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignOutState = { ok: false; reason: "failed" } | undefined;

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const requestHeaders = await headers();
  const origin = validateActionOrigin(
    requestHeaders.get("origin"),
    requestHeaders.get("host"),
  );
  if (!origin) redirect(signInPath("failed", next));

  // redirect() works by throwing, so it must stay outside the try block.
  const target = await startGoogleFlow(
    `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
  );
  redirect(target.ok ? target.url : signInPath(target.code, next));
}

async function startGoogleFlow(
  redirectTo: string,
): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      const status = classifyAuthResult({ user: undefined, error });
      return {
        ok: false,
        code: status === "unavailable" ? "unavailable" : "failed",
      };
    }
    return data.url
      ? { ok: true, url: data.url }
      : { ok: false, code: "failed" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function signOut(): Promise<SignOutState> {
  try {
    const supabase = await createSupabaseServerClient();
    // "local" ends this device only; other devices stay signed in.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
  redirect("/sign-in");
}
