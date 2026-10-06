# src/lib/extraction

The add link pipeline: a pasted web page or YouTube link becomes a saved recipe or one typed failure.
Governing specs: [0006 web page](../../../docs/specs/0006-recipe-from-web-page-link/index.md),
[0002 YouTube](../../../docs/specs/0002-recipe-from-youtube-link/index.md), and the acceptance
contract in [0001](../../../docs/specs/0001-stack-architecture/index.md).

## Map

- `add-recipe-from-link.ts`: the one Server Action for every pasted link. Parses, routes to a `Route` (web or YouTube), then auth, duplicate lookup, quota reservation, extraction, signed save. Success always ends in `redirect()`.
- `extract-from-web.ts`: the web pipeline after reservation (`safeFetch`, JSON-LD, then Gemini on page text).
- `youtube/`: the YouTube pipeline after reservation. `parse-youtube-url.ts` keeps only the video ID and rebuilds the canonical URL; `youtube-metadata.ts` is the only reader of `YOUTUBE_API_KEY`; `extract-from-youtube.ts` runs the ladder (creator page, then description).
- `safe-fetch.ts` + `hop-check.ts`: the only way to fetch a user supplied web URL. Blocks private addresses at connect time and YouTube hosts on redirect.
- `parse-html.ts`: `parseHtml`, the only caller of `node-html-parser`'s `parse`. Refuses markup deeper than 256 levels (32 for JSON-LD fields) before `parse` can block the event loop or a recursive walker overflows; callers map `undefined` to `page_unreadable` (web) or a failed link (creator page).
- `contract.ts`: the acceptance contract every source passes; `grounding.ts` checks every value against the source text.
- `messages.ts`: every user facing failure text, keyed `source:reason` with `any:reason` as fallback. Raw error text never reaches the user.
- `deadline.ts`: the 75 s deadline and per step budgets (`STEP_BUDGET_MS`).

## Rules

- Every outcome is `recipe`, `not_a_recipe`, `insufficient` or `ingestion_failed`, with a reason from `ATTEMPT_REASONS` in [src/lib/ai/attempt-reasons.ts](../ai/attempt-reasons.ts). A new reason goes there first, then gets a message in `messages.ts`.
- Failures before a reservation (`invalid_link`, `signed_out`, a missing `YOUTUBE_API_KEY`, a duplicate) leave no `ai_attempts` row. After a reservation, every path finishes the attempt.
- One `Deadline` per request, created on the action's first line. Check `fitsBudget` before a step starts and pass `stepSignal(deadline, budget)` into it.
- Network, Gemini and quota modules import `server-only`. Parsing, grounding, ladder and schema modules stay pure (no `server-only`, no env reads) so `pnpm check:extraction` can import them directly.
- Fetched or JSON-LD markup is parsed only through `parseHtml`, never `parse` directly; `check:extraction` fails if another file imports `parse`. Parsing is synchronous, so no `AbortSignal` can stop it.
- Logs are one JSON line per event. Never log the pasted URL's extra parameters, description text, or the YouTube request URL (it carries the key).

## Checks

`pnpm check:extraction` ([scripts/check-extraction.mjs](../../../scripts/check-extraction.mjs)) covers the pure modules. Add a case there when you change parsing, grounding, durations or the ladder. Runtime behavior is proved with `/check verify` against each spec's `verify.md`.

_Drafted by /sync from the introducing change, worth a quick human pass._
