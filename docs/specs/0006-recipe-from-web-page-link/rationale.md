# 0006. Rationale: recipe from a web page link

The decision record behind [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

Feature #6 turns a pasted recipe page link into a saved recipe in under a minute, with a clear message for a broken, blocked or non recipe link. It is the simplest source, so the scope uses it to prove the extraction contract first. Most of the ground rules are already fixed: 0001 set the guarded fetch helper, the acceptance contract, the zod schemas, the 75 s deadline and the quota; 0003 set the save, duplicate and quota functions; 0002 set the shared provider response schema and the grounding rules after Gemini invented an amount and an ingredient in the first spike.

What is left open is how to get a recipe out of arbitrary HTML. Recipe pages are long, full of ads, stories and comments, and they vary wildly in markup. Many of them also carry schema.org `Recipe` data as JSON-LD (structured data for search engines), but its shape varies: nested in `@graph`, with `@type` as an array, instructions as one string, a list of strings, or nested sections, and ingredients as free text lines that mix amount, unit, name and notes.

The forces: no AI cost where it can be avoided (a 20 per user, 300 app wide daily budget), nothing invented (the shared trust bar after the spike), under a minute end to end on Vercel, one builder who has to understand and debug the code, and #7 waiting to reuse whatever #6 builds. #6 is also built before #7, so it carries the shared parts (`safeFetch`, schemas, contract, grounding, the action and the form), and #8's recipe page does not exist yet, so a saved recipe has nowhere to land.

Not deciding leaves `/develop` to invent the HTML handling, the ingredient splitting and the failure messages, which are exactly the places a recipe extractor goes wrong.

## Options considered

### Option 1: Gemini on page text for every page

Fetch the page, strip it to text, always send it to Gemini with the provider schema, then ground.

**Pros**:
- One code path; no JSON-LD walking, no ingredient line parser.
- Handles pages with and without structured data the same way.

**Cons**:
- Every paste costs a Gemini call and 5 to 30 s, even when the site already publishes the exact recipe.
- Grounding can clear amounts that JSON-LD would have given exactly (an amount on a different line from its ingredient).
- Throws away the most reliable data on the page.

### Option 2: JSON-LD first, grounded Gemini on stripped page text as the fallback (chosen)

Read the site's JSON-LD `Recipe` with an HTML parser and a small pure ingredient line parser; save it when it passes the contract. Otherwise strip the page to its main text and send that to Gemini, then ground and check again.

**Pros**:
- The common case is exact, fast and free of AI cost.
- The fallback keeps the same no invention bar as YouTube.
- Matches what 0001 already sketched and what #7 step 1 needs (a reusable JSON-LD reader).

**Cons**:
- Two paths to build and verify, plus a hand written ingredient parser.
- JSON-LD is trusted as published, with no grounding.
- The ingredient parser gets some lines awkward (nested amounts like `1 (14 oz) can`).

### Option 3: JSON-LD only, no AI fallback

Save only what JSON-LD gives; any page without usable JSON-LD gets "we can't read a recipe from this page".

**Pros**:
- No Gemini code in #6 at all, smallest and cheapest.
- Every saved value comes straight from the site's structured data.

**Cons**:
- Fails every page without JSON-LD (older blogs, personal sites, many non English sites).
- #7 still needs the Gemini text path and grounding, so the work only moves, it does not disappear.
- Worse demo: some pastes fail where a reader would expect success.

### Option 4: Readability style article extraction plus Gemini

Use `linkedom` and `@mozilla/readability` to pull the "main article", then Gemini (with JSON-LD first or not).

**Pros**:
- Better main content detection than a home made heuristic, so less noise in the prompt.

**Cons**:
- Two extra dependencies and a slower parse.
- Readability is tuned for articles and can drop ingredient lists that recipe plugins put in side boxes or cards.
- More moving parts to explain and debug for one builder.

## Rationale

Option 2 wins because it puts each tool where it is strongest. Structured data, when present, is the site's own statement of the recipe, so reading it is both cheaper and more faithful than any model; that directly serves the cost budget and the no invention bar. Gemini is kept for the pages that need it, and there the 0002 grounding rules apply unchanged, so web and YouTube share one trust bar and one `grounding.ts`. Option 1 spends quota and latency on the easy case and can lose exact amounts; Option 3 is simpler but fails a real share of pages while #7 still needs the Gemini text path anyway.

The smaller calls follow the same line. `node-html-parser` over `cheerio` and Readability: it is small, fast and pure JS, enough for finding `ld+json` scripts and stripping page chrome, and a simple "article or main, else body" heuristic keeps ingredient boxes that Readability might drop. Runner up: `cheerio`, more spec correct but heavier. A pure ingredient line parser over the `parse-ingredient` package: `grounding.ts` already needs a number reader, so the parser reuses it and stays readable for a junior; runner up `parse-ingredient`, more edge cases for one more dependency. Not calling Gemini to split ingredient lines keeps the JSON-LD path free of AI.

On failure handling, split fetch reasons (`site_blocked`, `page_not_found`, `fetch_failed`) cost a few lines and tell #10 which sites block Sotus from Vercel, which is the biggest practical risk for this feature. The 300 character cutoff avoids paying Gemini to say "no recipe" about a page Sotus simply could not read, and gives the user the honest message. Keeping the duplicate key on the pasted URL matches 0003's design (lookup before quota) and avoids an RPC change; the cost is some duplicates from redirects. JSON-LD stays ungrounded because structured data is often not echoed word for word in visible text, so grounding it would reject many good recipes. The honest `User-Agent` is kept even though some sites block it; impersonating a browser would be fragile and against those sites' wishes.

Shipping #6 together with #7 slice 1 (your choice) means no "YouTube not supported yet" state is ever deployed, at the cost of #6 not shipping alone. A minimal recipe page inside #6 keeps the Skateboard promise that every step is usable, and #8 restyles it later rather than starting from nothing.

## Review reconciliation (2026-10-06)

The first draft was cross checked by a different model (Sonnet) and reconciled against that review and a Codex review, as a targeted revision, not a redesign. Your instructions settled each load bearing point; this records what changed and why.

**Accepted and applied**:
- *Timing*: the Gemini call and its single retry share one 30 s budget; the retry gets only what is left, after a 1 s pause, and only with at least 5 s left. SDK retries are off. A per day 429 is not retried. The worst case is now 51 s. The draft gave the retry a fresh 30 s, which could reach about 65 s.
- *Auth*: 0005 owns it. The action uses `requireActionUser()` with distinct `signed_out` and `unavailable` results; the recipe page calls `requirePageUser()` and renders `AuthUnavailable`. The draft wrongly used `requireUser()` with a redirect.
- *Failure taxonomy*: a Gemini failure mapping table; `service_unavailable` for failures before a row exists; `internal_error` for unexpected throws; `save_failed` only from `save_recipe`; a failed finish is logged and never replaces the user's message. The database outcome enum is unchanged; the new reasons are text, so there is no migration.
- *SSRF and fetch*: host checks before DNS on every hop (IP literals in every form, `localhost`, YouTube hosts); host normalization; `Accept-Encoding: identity` with a decoded byte cap; only 301, 302, 303, 307 and 308 followed; a missing `Content-Type` is `unsupported_content`; BOM handling; the normalized `href` is fetched.
- *Model output order*: field limits first, then grounding, then counts.
- *JSON-LD*: line breaks kept from `<br>`, `<p>` and `<li>`; `mainEntity`, single strings and single step objects handled; blanks dropped before counting; two or more distinct recipes are refused rather than one being picked.
- *Parser*: two word units first (`fl oz`); a quantity over its limit moves into the name; the pinned cases live in `verify.md`.
- *Page text*: first 20k plus last 40k characters on long pages; a `form` holding most of the page is kept.
- *Form*: the submitted `url` is echoed back in the action state; `type="text"`, `inputMode="url"`, `noValidate`; focus moves back by an effect keyed on the state.
- *Details*: byte based URL length; the recipe page's ingredient line, tab title and `noindex`; `\p{L}+` grounding tokens with English only extraction; `temperature: 0` and `thinkingBudget: 0`; the `SOTUS_USER_AGENT` constant; "request start" defined; messages keyed by source plus reason.

**Rejected**:
- *Truncating at 2 MB instead of failing* (`too_large`): it would quietly override 0001's ingestion boundary. JSON-LD sits near the top of a page anyway, so the gain is small. 0001's rule stands.
- *Stripping `header` and `aside` only conditionally*: not taken. Only the `form` rule changed; `header` and `aside` rarely hold the recipe, and the long page rule covers the bigger risk.

**Resolved here, with a recommendation the review left open**:
- *Several recipes on one page*: "do not choose arbitrarily" became "refuse with `multiple_recipes`", after duplicates of the same recipe are collapsed. Picking by title overlap (0002's creator page rule) was the runner up; a pasted web link has no second title to compare against, so it would still be a guess.
- *A failure between dedup and reservation*: the reservation is never aborted from the client, which closes the orphan row case without a database change.
