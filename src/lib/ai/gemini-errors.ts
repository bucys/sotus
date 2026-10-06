export type GeminiFailureReason =
  | "provider_error"
  | "provider_rejected"
  | "timeout"
  | "model_blocked"
  | "invalid_model_output";

export type GeminiFailure = {
  readonly reason: GeminiFailureReason;
  readonly retry: boolean;
  /** The mapping row, for the log line. */
  readonly row: string;
};

const NETWORK_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const BLOCKED_FINISH_REASONS: ReadonlySet<string> = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

const failure = (
  reason: GeminiFailureReason,
  row: string,
  retry = false,
): GeminiFailure => ({ reason, retry, row });

function errorCodes(error: unknown): readonly string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

/**
 * The SDK puts the API's error body in the message. A per day quota is named by a
 * `QuotaFailure` violation whose quota id contains `PerDay`.
 */
export function isDailyQuotaError(message: string): boolean {
  const start = message.indexOf("{");
  if (start >= 0) {
    try {
      const body = JSON.parse(message.slice(start)) as {
        error?: {
          details?: { "@type"?: string; violations?: { quotaId?: string }[] }[];
        };
      };
      return (body.error?.details ?? []).some(
        (detail) =>
          detail["@type"]?.endsWith("QuotaFailure") === true &&
          (detail.violations ?? []).some((violation) =>
            violation.quotaId?.includes("PerDay"),
          ),
      );
    } catch {
      // Not JSON after all: fall back to the plain text check below.
    }
  }
  return /QuotaFailure[\s\S]*PerDay/.test(message);
}

/** A thrown error from `generateContent`, mapped per 0006 *Gemini failure mapping*. */
export function classifyGeminiError(
  error: unknown,
  aborted: boolean,
): GeminiFailure {
  const name = (error as { name?: unknown } | undefined)?.name;
  if (aborted || name === "AbortError" || name === "TimeoutError") {
    return failure("timeout", "abort");
  }

  const status = (error as { status?: unknown } | undefined)?.status;
  if (typeof status === "number") {
    const message = String((error as { message?: unknown }).message ?? "");
    if (status === 429 && isDailyQuotaError(message)) {
      return failure("provider_error", "429_per_day");
    }
    if ([429, 500, 502, 503, 504].includes(status)) {
      return failure("provider_error", `http_${status}`, true);
    }
    if (status === 401 || status === 403) {
      return failure("provider_rejected", `http_${status}`);
    }
    if (status === 400 || status === 404) {
      return failure("provider_rejected", `http_${status}`);
    }
    return failure("provider_error", `http_${status}`);
  }

  const codes = errorCodes(error);
  const isNetwork =
    codes.some((code) => NETWORK_CODES.has(code)) ||
    (error instanceof TypeError &&
      /fetch failed|network|socket/i.test(error.message));
  if (isNetwork) return failure("provider_error", "network", true);

  return failure("provider_error", "unknown_error");
}

export type GeminiResponseShape = {
  readonly promptFeedback?: { readonly blockReason?: unknown };
  readonly candidates?: readonly { readonly finishReason?: unknown }[];
  readonly text?: string;
};

/** A response that came back, checked before its JSON is parsed. */
export function classifyGeminiResponse(
  response: GeminiResponseShape,
): GeminiFailure | { readonly text: string } {
  if (response.promptFeedback?.blockReason) {
    return failure("model_blocked", "prompt_blocked");
  }
  const finishReason = String(response.candidates?.[0]?.finishReason ?? "");
  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    return failure("model_blocked", `finish_${finishReason.toLowerCase()}`);
  }
  if (finishReason === "MAX_TOKENS") {
    return failure("invalid_model_output", "max_tokens");
  }
  if (!response.candidates?.length || !response.text) {
    return failure("invalid_model_output", "empty");
  }
  return { text: response.text };
}
