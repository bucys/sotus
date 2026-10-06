import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export type AuthStatus = "signed_in" | "signed_out" | "unavailable";

type AuthResult = {
  user: unknown;
  error: unknown;
};

/**
 * One answer to "who is this?" for the proxy, requireUser() and the callback.
 * Anything it does not recognise is "unavailable": signing people out on a guess
 * would turn a Supabase outage into a mass sign out.
 */
export function classifyAuthResult({ user, error }: AuthResult): AuthStatus {
  if (!error) return user ? "signed_in" : "signed_out";

  if (isAuthRetryableFetchError(error)) return "unavailable";
  if (!isAuthError(error)) return "unavailable";

  const { status } = error;
  if (status === undefined) {
    // A missing session is the one auth error with no HTTP status that means signed out.
    return error.name === "AuthSessionMissingError"
      ? "signed_out"
      : "unavailable";
  }
  // 429 is Supabase rate limiting us, not a bad session.
  if (status === 429) return "unavailable";
  return status >= 400 && status < 500 ? "signed_out" : "unavailable";
}
