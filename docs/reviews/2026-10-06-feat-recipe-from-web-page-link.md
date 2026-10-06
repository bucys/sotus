# Review, feat/recipe-from-web-page-link, 2026-10-06

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 53 files, branch vs main (merge base 8358b5a)
**Verdict**: Changes requested

## Summary
The branch adds the web page path to the shared add link action: a guarded fetch, a JSON-LD reader, a page text fallback with grounded Gemini, the recipe page and the form, on top of the YouTube slice. Typecheck passes and `pnpm check:extraction` passes (177 checks). The structure follows the spec closely: one door for URLs, quota reserved before cost, typed results, one deadline. The headline issue is that the HTML parser can be made to run for minutes on a small hostile page, and no deadline can interrupt it. The rest are small robustness items. Both minors from the earlier YouTube review are fixed.

## Major
### 🟠 A small hostile page can freeze the function for minutes, `src/lib/extraction/extract-from-web.ts:80`
**Problem**: `parse(fetched.html)` from `node-html-parser` takes time that grows roughly with the cube of the nesting depth when tags are left unclosed. I measured it with the installed version: 2,000 unclosed `<div>` tags take 0.3 s, 4,000 take 3.3 s, 8,000 take 29 s (that is about 40 KB of HTML). `<b>` nesting behaves the same. The 2 MB cap allows hundreds of thousands of tags, so it can run for hours. The same call is made on creator pages in `src/lib/extraction/youtube/creator-page.ts:45`, and a YouTube video owner controls those links.
**Why it matters**: The parse is synchronous, so the 75 s `AbortSignal`, the step budgets and `fitsBudget` cannot stop it. Any signed in user can host a tiny page and paste it; the Node event loop of that instance is blocked for every other user on it (Fluid compute shares instances) until the platform kills the request at `maxDuration`. The attempt then stays `started` and reads as `interrupted`, and the user's quota is spent. The spec says the pathological page is "measured once in verify", but `verify.md` has no such case.
**Suggested fix**: Do not hand untrusted markup to this parser unguarded. Options: cap the number of tags or the nesting depth with a cheap linear pre scan and fail the page as `page_unreadable` or `too_large` when exceeded; or move parsing to a worker thread with a hard timeout; or use a parser that is linear on unclosed tags. Add the deep unclosed nesting case to verify and to `check-extraction.mjs` (it is a pure function, so a timing guard can run there).

## Minor
### 🟡 Deeply nested but closed HTML or JSON overflows the stack and spends the attempt, `src/lib/extraction/html-to-lines.ts:45`
**Problem**: `collect` recurses once per nesting level. I confirmed that 20,000 nested closed `<div>` tags make `readPageText` throw a `RangeError`. `collectRecipeNodes` (`read-jsonld.ts:83`) and `flattenInstructions` (`read-jsonld.ts:106`) recurse the same way on deeply nested JSON, which `JSON.parse` accepts.
**Why it matters**: The throw is caught at the action edge, so nothing crashes, but the user sees "Something went wrong on our side" for what is a bad page, and the attempt counts against their quota.
**Suggested fix**: Walk with an explicit stack, or stop at a maximum depth and return `page_unreadable`. Handle it together with the Major above.

### 🟡 The prompt marker can be closed by a spaced or multi line tag, `src/lib/extraction/prompt.ts:13`
**Problem**: `withoutMarkers` removes only the exact text `<source>` and `</source>`. I confirmed that `</source >` and `</SOURCE\n>` pass through untouched.
**Why it matters**: A page can try to close the untrusted block early and speak as the instructions. Grounding limits what a model can invent, so the damage is bounded (a wrong `not_a_recipe`, or odd step wording), but the guard is weaker than its comment says.
**Suggested fix**: Match `<\/?\s*source\b[^>]*>` case insensitively, or escape every `<` in the page text.

### 🟡 A failure after the model call loses the token counts, `src/lib/extraction/add-recipe-from-link.ts:260`
**Problem**: The catch path finishes the attempt with `NO_TOKENS`, even if Gemini already ran and returned usage (for example when `saveRecipe` throws after extraction).
**Why it matters**: Token accounting on `ai_attempts` undercounts exactly the attempts that failed late. This path was not exercised at runtime (AC-17 drill deferred).
**Suggested fix**: Keep the latest known tokens in a variable set after `route.extract` returns, and pass them in the catch. This is the one place worth a look when the deferred drills are run.

### 🟡 A database read error on the recipe page throws instead of returning a result, `src/lib/recipes/load-recipe.ts:59`
**Problem**: `loadRecipe` returns typed `found`, `not_found` and `unavailable`, but a failed query throws `Could not load recipe`.
**Why it matters**: When the project is paused or briefly unreachable, the user lands on the error boundary rather than the calm unavailable state the rest of the page uses. AGENTS.md prefers typed results for expected failures, and a database outage is expected here.
**Suggested fix**: Return `{ status: "unavailable" }` for a query error (log it) and render `AuthUnavailable` or a database specific message.

## Nits
- ⚪ `src/lib/extraction/grounding.ts:118`, an ingredient whose tokens are all under 3 letters (for example `xo`) is treated as grounded without being looked up, because `every` on the filtered list is true when it is empty.
- ⚪ `src/lib/ai/gemini.ts:28`, `GEMINI_API_KEY` and `GEMINI_MODEL` throw at import, and so does `RECIPE_PUBLISH_SECRET` in `sign-payload.ts`. Because the home page imports the action, a missing variable now breaks the whole home page and the Vercel build for any environment that lacks them. This matches the "fail at boot" rule, so just confirm all three Vercel environments carry these values.
- ⚪ `package.json`, `pnpm check:extraction` prints a `MODULE_TYPELESS_PACKAGE_JSON` warning for every `.ts` file. Harmless; a `--no-warnings` flag in the script would quiet it.
- ⚪ `src/lib/extraction/hosts.ts:7`, `youtube-nocookie.com` is still not a YouTube host, so it takes the web path (open nit from the earlier review). `safeFetch` treats it as an ordinary host, which is safe.
- ⚪ `src/lib/extraction/youtube/extract-from-youtube.ts:190`, the video title still feeds grounding (open nit from the earlier review); same as the web path, so a choice rather than a bug.

## Strengths
- `safeFetch` is careful: the address check runs at connect time on every resolved address (rebinding and happy eyeballs both covered), hop checks cover IP literals, mapped IPv6, `localhost.` and YouTube hosts on redirects, and the size cap counts decoded bytes, so a compression bomb stops at 2 MB. I confirmed `::1`, `::ffff:7f00:1`, NAT64, link local, CGNAT and unique local addresses are all rejected.
- The action edge is sound: `unstable_rethrow` before the catch all, a quota reservation that is never aborted, `finishAttempt` that cannot throw, and no attempt row for auth, dedup, config or database failures.
- Quota and key handling is right: the missing `YOUTUBE_API_KEY` check now happens before reservation (the earlier review's main finding), and an unreadable duration is a metadata failure instead of `video_too_long`.
- Pure modules (grounding, numbers, ingredient parser, JSON-LD reader, titles) are cleanly separated from the network code and covered by `check:extraction`.
- Messages are centralised and keyed by source, so raw error text never reaches the user, and the form follows the pending and focus contract.

## Test coverage
None by design (typecheck plus `pnpm check:extraction` plus `/check verify`). Both gates pass. The gap to close in verify: a pathological page (deep unclosed nesting, then deep closed nesting) was specified but never run. The deferred drills (two account race, outage, forced `internal_error`, failed `finish_ai_attempt`) cover paths I could only read; they read correctly, apart from the token count note above.
