import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountProfile = {
  displayName: string;
  avatarUrl: string | undefined;
};

export const FALLBACK_DISPLAY_NAME = "Sotus cook";

/** A missing row or a failed query is an ordinary state: the menu still works. */
export async function loadProfile(userId: string): Promise<AccountProfile> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    return {
      displayName: data?.display_name?.trim() || FALLBACK_DISPLAY_NAME,
      avatarUrl: data?.avatar_url || undefined,
    };
  } catch {
    return { displayName: FALLBACK_DISPLAY_NAME, avatarUrl: undefined };
  }
}
