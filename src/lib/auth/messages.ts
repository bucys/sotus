export type AuthErrorCode = "cancelled" | "failed" | "unavailable";

const AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  "cancelled",
  "failed",
  "unavailable",
];

export const authMessages = {
  wordmark: "Sotus",
  purpose:
    "Turn cooking videos and recipe links into clean recipes you can cook from.",
  button: "Continue with Google",
  buttonPending: "Opening Google",
  inAppBrowserHint: "Google not loading? Open Sotus in Safari or Chrome.",
  signOutFailed: "We could not sign you out. Please try again.",
  unavailableTitle: "Sotus cannot check your sign in",
  unavailableBody: "Please try again in a moment.",
} as const;

export const errorMessages: Record<AuthErrorCode, string> = {
  cancelled: "Sign in was cancelled. You can try again when you are ready.",
  failed: "We could not sign you in. Please try again.",
  unavailable:
    "Sotus cannot reach sign in right now. Please try again in a moment.",
};

/**
 * `error` + `error_code` pairs that mean the person backed out at Google.
 * Starts empty on purpose: a case is added only after it was seen in a real run
 * (spec 0005), so until then a cancel shows the generic message.
 */
export const KNOWN_CANCELLATIONS: readonly {
  error: string;
  errorCode: string;
}[] = [];

export function toAuthErrorCode(value: unknown): AuthErrorCode {
  return AUTH_ERROR_CODES.find((code) => code === value) ?? "failed";
}

export function classifyProviderError(
  error: string | null,
  errorCode: string | null,
): AuthErrorCode {
  const isCancellation = KNOWN_CANCELLATIONS.some(
    (known) => known.error === error && known.errorCode === errorCode,
  );
  return isCancellation ? "cancelled" : "failed";
}
