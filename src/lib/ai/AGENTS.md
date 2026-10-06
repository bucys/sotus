# src/lib/ai

## Overview

The paid edges of extraction: the Gemini client and the AI attempt (quota) records. Every
extraction reserves an attempt here before it spends anything, and ends it here with one
outcome and reason. The pipelines that call it live in [src/lib/extraction/](../extraction/AGENTS.md).

## Key files

| File                 | Owns                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `attempt-reasons.ts` | `ATTEMPT_REASONS`, the only list of reasons stored in `ai_attempts.reason`, plus the four action only reasons that never get a row; maps database error texts to typed reasons |
| `quota.ts`           | `openExistingRecipe`, `reserveAttempt`, `finishAttempt`, `saveRecipe`: thin wrappers over the Supabase RPCs, each returning a typed result                                     |
| `gemini.ts`          | The one `@google/genai` client, pinned settings, `generateRecipe` (one budget) and `generateRecipeInSteps` (a fresh budget per call, for YouTube)                              |
| `gemini-errors.ts`   | Pure mapping of a thrown error or a returned response to a `GeminiFailure` (reason, retry or not, and the mapping row for the log)                                             |

## Conventions

- A new reason goes into `ATTEMPT_REASONS` first (it is stored as text, at most 60 characters), then gets a user message in `src/lib/extraction/messages.ts`.
- Database errors are matched by exact message text through a `Map`, never an object, so a message like `constructor` cannot hit the prototype. Unknown texts fall back: `service_unavailable` before an attempt exists, `save_failed` after.
- Exactly one retry, owned by this module. The SDK's own retry is off (`retryOptions: { attempts: 1 }`). The retry waits 1 s and only runs when the budget still fits.
- `GEMINI_SETTINGS` sits next to `GEMINI_MODEL` so a model change that needs other values is one edit. Both `GEMINI_API_KEY` and `GEMINI_MODEL` throw at import when absent.
- `gemini-errors.ts` and `attempt-reasons.ts` stay pure (no `server-only`) so `pnpm check:extraction` can import them; `gemini.ts` and `quota.ts` are `server-only`.

## Gotchas

- `reserveAttempt` takes no `AbortSignal` on purpose: a committed reservation lost to an abort would leave an orphan `started` row.
- `finishAttempt` never throws. Its own failure is logged as `finish_failed` and the row then reads as `interrupted`.
- `saveRecipe` signs the payload (`RECIPE_PUBLISH_SECRET`) and finishes the attempt in the same database transaction; do not call `finishAttempt` after a successful save.
- `GEMINI_TEST_FAILURE` (`503-twice`, `503-late`, `429-daily`) simulates provider failures for `/check verify`. It only works when `NODE_ENV` is `development`.
- A 429 is retried unless its body names a per day quota (`QuotaFailure` with `PerDay`); a daily limit will not clear in 1 s.

## Related specs

- [0001 stack and architecture](../../../docs/specs/0001-stack-architecture/index.md): the acceptance contract and attempt lifecycle
- [0003 data model](../../../docs/specs/0003-data-model/index.md): `reserve_ai_attempt`, `finish_ai_attempt`, `save_recipe`
- [0006 web page](../../../docs/specs/0006-recipe-from-web-page-link/index.md): _Gemini failure mapping_
- [0002 YouTube](../../../docs/specs/0002-recipe-from-youtube-link/index.md): _Step budgets_

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
