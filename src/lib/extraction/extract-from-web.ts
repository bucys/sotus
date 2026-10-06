import "server-only";

import { generateRecipe } from "@/lib/ai/gemini";
import type { Tokens } from "@/lib/ai/quota";

import {
  acceptModelResponse,
  failed,
  type ExtractionOutcome,
} from "./contract";
import {
  STEP_BUDGET_MS,
  canStart,
  fitsBudget,
  stepSignal,
  type Deadline,
} from "./deadline";
import { normalizeHost } from "./hosts";
import { PAGE_TEXT_MIN, readPageText } from "./page-text";
import { parseHtml } from "./parse-html";
import { TEXT_SYSTEM_INSTRUCTION, buildTextPrompt } from "./prompt";
import { readJsonLd, type JsonLdResult } from "./read-jsonld";
import { safeFetch } from "./safe-fetch";
import { pageTitleFallback, readPageTitle, toSourceTitle } from "./titles";

export type WebExtraction = {
  readonly result: ExtractionOutcome;
  readonly sourceTitle?: string;
  readonly tokens: Tokens;
  /** Fields for the attempt's JSON log line. Never page text or the full URL. */
  readonly log: Readonly<Record<string, unknown>>;
};

const NO_TOKENS: Tokens = { input: 0, output: 0 };

function describeJsonLd(jsonLd: JsonLdResult): string {
  if (!jsonLd.found) return "none";
  if (jsonLd.multiple) return "multiple";
  return jsonLd.usable ? "used" : `unusable:${jsonLd.why}`;
}

/**
 * The web pipeline after reservation: fetch through `safeFetch`, read the page's JSON-LD,
 * and only when that fails, ground Gemini's reading of the page text. Ends in exactly
 * one contract outcome; saving or finishing the attempt is the caller's job.
 */
export async function extractFromWeb(
  url: string,
  deadline: Deadline,
): Promise<WebExtraction> {
  if (!canStart(deadline)) {
    return {
      result: failed("ingestion_failed", "timeout"),
      tokens: NO_TOKENS,
      log: {},
    };
  }

  const requested = new URL(url);
  const fetchStart = Date.now();
  const fetched = await safeFetch(
    requested.href,
    stepSignal(deadline, STEP_BUDGET_MS.fetch),
  );
  const fetchLog = {
    http_status: fetched.status,
    redirects: fetched.redirects,
    fetch_ms: Date.now() - fetchStart,
  };
  if (!fetched.ok) {
    return {
      result: failed("ingestion_failed", fetched.reason),
      tokens: NO_TOKENS,
      log: fetchLog,
    };
  }

  const parseStart = Date.now();
  const root = parseHtml(fetched.html);
  if (!root) {
    return {
      result: failed("ingestion_failed", "page_unreadable"),
      tokens: NO_TOKENS,
      log: { ...fetchLog, parse_ms: Date.now() - parseStart, too_deep: true },
    };
  }
  const pageTitle = readPageTitle(root);
  const sourceTitle = toSourceTitle(pageTitle);
  const jsonLd = readJsonLd(root, pageTitle);
  const baseLog = {
    ...fetchLog,
    redirected:
      normalizeHost(new URL(fetched.finalUrl).hostname) !==
      normalizeHost(requested.hostname),
    jsonld: describeJsonLd(jsonLd),
  };

  if (jsonLd.found && jsonLd.multiple) {
    return {
      result: failed("insufficient", "multiple_recipes"),
      sourceTitle,
      tokens: NO_TOKENS,
      log: { ...baseLog, parse_ms: Date.now() - parseStart },
    };
  }
  if (jsonLd.found && jsonLd.usable) {
    return {
      result: {
        outcome: "recipe",
        recipe: jsonLd.recipe,
        method: "web_jsonld",
      },
      sourceTitle,
      tokens: NO_TOKENS,
      log: { ...baseLog, parse_ms: Date.now() - parseStart },
    };
  }

  const pageText = readPageText(root);
  const textLog = {
    ...baseLog,
    parse_ms: Date.now() - parseStart,
    text_chars: pageText.chars,
    text_trimmed: pageText.trimmed,
  };
  if (pageText.chars < PAGE_TEXT_MIN) {
    return {
      result: failed("ingestion_failed", "page_unreadable"),
      sourceTitle,
      tokens: NO_TOKENS,
      log: textLog,
    };
  }

  if (!fitsBudget(deadline, STEP_BUDGET_MS.gemini)) {
    return {
      result: failed("ingestion_failed", "timeout"),
      sourceTitle,
      tokens: NO_TOKENS,
      log: textLog,
    };
  }

  // One signal for the call and its retry, so both share the 30 s budget.
  const geminiStart = Date.now();
  const gemini = await generateRecipe(
    TEXT_SYSTEM_INSTRUCTION,
    buildTextPrompt(pageTitle, pageText.lines),
    stepSignal(deadline, STEP_BUDGET_MS.gemini),
    geminiStart + STEP_BUDGET_MS.gemini,
  );
  const geminiLog = {
    ...textLog,
    gemini_calls: gemini.calls,
    gemini_ms: Date.now() - geminiStart,
  };
  if (!gemini.ok) {
    return {
      result: failed("ingestion_failed", gemini.failure.reason),
      sourceTitle,
      tokens: gemini.tokens,
      log: { ...geminiLog, gemini_error: gemini.failure.row },
    };
  }

  const accepted = acceptModelResponse(gemini.response, {
    method: "web_model",
    sourceLines: pageTitle ? [pageTitle, ...pageText.lines] : pageText.lines,
    titleBefore:
      jsonLd.found && !jsonLd.multiple && !jsonLd.usable
        ? jsonLd.name
        : undefined,
    titleAfter: pageTitleFallback(pageTitle),
  });
  return {
    result: accepted.result,
    sourceTitle,
    tokens: gemini.tokens,
    log: {
      ...geminiLog,
      dropped_ingredients: accepted.droppedIngredients,
      cleared_amounts: accepted.clearedAmounts,
    },
  };
}
