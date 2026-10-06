import "server-only";

import { GoogleGenAI } from "@google/genai";

import { pause } from "@/lib/extraction/deadline";
import {
  providerResponseJsonSchema,
  providerResponseSchema,
  type ProviderResponse,
} from "@/lib/extraction/schemas";

import {
  classifyGeminiError,
  classifyGeminiResponse,
  type GeminiFailure,
  type GeminiResponseShape,
} from "./gemini-errors";

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

const apiKey = required("GEMINI_API_KEY", process.env.GEMINI_API_KEY);
export const GEMINI_MODEL = required("GEMINI_MODEL", process.env.GEMINI_MODEL);

/** Pinned next to the model, so a model change that needs other values is one edit. */
export const GEMINI_SETTINGS = {
  maxOutputTokens: 4096,
  temperature: 0,
  thinkingConfig: { thinkingBudget: 0 },
} as const;

const RETRY_PAUSE_MS = 1_000;
const RETRY_MIN_REMAINING_MS = 5_000;

// The SDK's own retry is off: the single retry below is the only one (0006 AC-9).
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: { retryOptions: { attempts: 1 } },
});

export type GeminiTokens = { readonly input: number; readonly output: number };

export type GeminiResult =
  | {
      readonly ok: true;
      readonly response: ProviderResponse;
      readonly calls: number;
      readonly tokens: GeminiTokens;
    }
  | {
      readonly ok: false;
      readonly failure: GeminiFailure;
      readonly calls: number;
      readonly tokens: GeminiTokens;
    };

type CallResult =
  | {
      readonly ok: true;
      readonly response: ProviderResponse;
      readonly tokens: GeminiTokens;
    }
  | {
      readonly ok: false;
      readonly failure: GeminiFailure;
      readonly tokens: GeminiTokens;
    };

const NO_TOKENS: GeminiTokens = { input: 0, output: 0 };

/**
 * Development only, for verify: `GEMINI_TEST_FAILURE` = `503-twice`, `503-late`
 * (the first call fails after 26 s) or `429-daily`. Ignored in every other environment.
 */
async function simulatedFailure(
  call: number,
  signal: AbortSignal,
): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const mode = process.env.GEMINI_TEST_FAILURE;
  const fail = (status: number, message: string) =>
    Object.assign(new Error(message), { name: "ApiError", status });

  if (mode === "503-twice") throw fail(503, "simulated 503");
  if (mode === "503-late" && call === 1) {
    await pause(26_000, signal);
    if (signal.aborted)
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    throw fail(503, "simulated late 503");
  }
  if (mode === "429-daily") {
    throw fail(
      429,
      JSON.stringify({
        error: {
          code: 429,
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [
                { quotaId: "GenerateRequestsPerDayPerProjectPerModel" },
              ],
            },
          ],
        },
      }),
    );
  }
}

function tokensOf(response: {
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
}): GeminiTokens {
  return {
    input: response.usageMetadata?.promptTokenCount ?? 0,
    output: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callOnce(
  call: number,
  systemInstruction: string,
  prompt: string,
  signal: AbortSignal,
): Promise<CallResult> {
  try {
    await simulatedFailure(call, signal);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        ...GEMINI_SETTINGS,
        systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: providerResponseJsonSchema,
        abortSignal: signal,
      },
    });
    const tokens = tokensOf(response);
    const checked = classifyGeminiResponse(response as GeminiResponseShape);
    if (!("text" in checked)) return { ok: false, failure: checked, tokens };

    let json: unknown;
    try {
      json = JSON.parse(checked.text);
    } catch {
      json = undefined;
    }
    const parsed = providerResponseSchema.safeParse(json);
    return parsed.success
      ? { ok: true, response: parsed.data, tokens }
      : {
          ok: false,
          failure: {
            reason: "invalid_model_output",
            retry: false,
            row: "schema",
          },
          tokens,
        };
  } catch (error) {
    return {
      ok: false,
      failure: classifyGeminiError(error, signal.aborted),
      tokens: NO_TOKENS,
    };
  }
}

const sum = (a: GeminiTokens, b: GeminiTokens): GeminiTokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
});

/**
 * One call plus at most one retry, both inside one budget: `signal` is created once
 * for the whole step and `budgetEndsAt` is when it fires. The retry waits 1 s and runs
 * only when at least 5 s remain.
 */
export async function generateRecipe(
  systemInstruction: string,
  prompt: string,
  signal: AbortSignal,
  budgetEndsAt: number,
): Promise<GeminiResult> {
  const first = await callOnce(1, systemInstruction, prompt, signal);
  if (first.ok) return { ...first, calls: 1 };
  if (!first.failure.retry) return { ...first, calls: 1 };

  await pause(RETRY_PAUSE_MS, signal);
  if (signal.aborted || budgetEndsAt - Date.now() < RETRY_MIN_REMAINING_MS) {
    return { ...first, calls: 1 };
  }

  const second = await callOnce(2, systemInstruction, prompt, signal);
  return { ...second, calls: 2, tokens: sum(first.tokens, second.tokens) };
}
