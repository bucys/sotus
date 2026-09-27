import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { publishableKey, supabaseUrl } from "./env";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(supabaseUrl, publishableKey);
}
