# 0001. Stack and architecture: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

Sotus is a course demo: a mobile first web app that turns a cooking video or recipe page link into a structured recipe, keeps it in a shared library and a personal collection, and uses AI to suggest what to cook. The repo has no code yet (0 source files). The scope (`docs/scope/scope.md`) fixes the boundaries: English only, sources are YouTube (including Shorts) and recipe web pages, everyone signed in can read every recipe, only the person who added a recipe may edit it.

The forces: one builder; under about 50 users (you plus course viewers); hosting and database on free tiers, with only pay per use AI allowed to cost money; a live public URL; and a delivery approach (Skateboard) that wants a usable whole quickly and grows it release by release. Your global rules set the default web stack (Next.js App Router, TypeScript, Tailwind, Framer Motion, lucide-react, Vercel) and ask for no backend by default, a light one when needed.

The hardest technical force is the headline demo: getting recipe content out of a YouTube video. Transcript scraping from cloud server IPs is often blocked by YouTube, and many cooking Shorts carry the recipe only in speech or on screen, not in the description. Web pages are easier because most recipe sites publish schema.org `Recipe` data. The data itself is relational (users, recipes, ingredients, steps, a user's saved recipes) with a clear ownership rule.

Not deciding blocks every other feature: the data model, sign in, extraction and the design system all build on this stack.

## Options considered

### Option 1: Next.js + Supabase + Gemini on Vercel

One Next.js app on Vercel. Supabase supplies Postgres, Google sign in and row level security. Gemini Flash extracts recipes and reads YouTube URLs directly.

**Pros**:
- Fewest moving parts: two managed platforms plus one AI API, all with free tiers.
- Ownership rules live in the database (RLS), matching the scope's access rule exactly.
- Gemini's native YouTube input removes the transcript scraping problem.

**Cons**:
- Supabase free projects pause when idle; RLS policies are a new skill and a security risk if wrong.
- YouTube extraction depends on one vendor's video understanding.

### Option 2: Next.js + Neon Postgres + Drizzle + a self hosted auth library + Claude on Vercel

Serverless Postgres with a typed ORM, an auth library running inside the app, and Claude for extraction with a transcript source for YouTube.

**Pros**:
- Excellent structured output quality from Claude; typed TS schema with Drizzle.
- No platform lock in for auth.

**Cons**:
- Authorization is enforced in app code on every query, not by the database.
- YouTube needs a transcript source: scraping (blocked from cloud IPs) or a paid transcript API (another vendor and cost), and Shorts with no captions still fail.
- More setup: auth tables, session handling, OAuth wiring.

### Option 3: Next.js + Convex + a hosted auth provider + Gemini

Convex as a reactive TypeScript backend with a hosted auth service.

**Pros**:
- Great developer experience, live updates for free, functions and data in one place.

**Cons**:
- Less transferable than SQL for a course audience; a document style store for relational data.
- Adds a third platform (auth provider) to configure.

### Option 4: Expo native app + Supabase (the earlier Vault direction)

A native mobile app with share sheet capture.

**Pros**:
- Best mobile feel; share a video straight from the YouTube app.

**Cons**:
- App store builds and device testing slow a demo badly; a public URL is harder to share.
- The scope explicitly defers native to later.

## Rationale

Option 1 wins on the two forces that matter most for this demo: the YouTube extraction problem and the one builder, free tier budget. Gemini documents public YouTube URLs as an input (marked preview), which could let the headline feature skip the fragile part (transcripts) and also cover Shorts where the recipe is only spoken. That availability does not prove recipe accuracy, schema compatibility or speed, so the YouTube half of the decision is conditional on a feasibility spike with a named model and pass criteria. Claude produces excellent structured output (Option 2), but it cannot watch a video, so it would inherit exactly the problem that breaks most recipe from video apps. Choosing Gemini still makes sense before the spike: it is the only option with a path around transcripts, and the web page feature does not depend on the outcome.

Supabase fits the data and the access rule: recipes, owners and collections are relational, and "everyone signed in reads, only the owner edits" is a pair of RLS policies. Putting that rule in the database means a forgotten check in a Server Action cannot leak or overwrite someone else's recipe. Google only sign in keeps it one tap on phones and avoids email delivery entirely (free platform email is rate limited). Supabase's pause on idle and the need to get policies right are real costs, recorded in Consequences.

Everything else follows the principle of adding nothing until it is needed: no ORM (supabase-js with generated types keeps RLS in the path), no queue (synchronous extraction under one explicit deadline fits under 50 users), no search engine, no file storage, no email. Each of these has a named upgrade path if a later feature measures a real need. Two Supabase projects instead of local Docker keep setup light while protecting the demo data.

Decisions made by the architect rather than asked, with the runner up:
- **Node 24 LTS** over Node 22 (older LTS): current long term support at the time of writing.
- **Supabase CLI SQL migrations** over dashboard edits: versioned and repeatable across two projects.
- **`proxy.ts` session refresh and redirect** over per page checks only: one place for "signed out goes to sign in"; pages still verify with `getUser()`.
- **Vercel logs plus a failures table** over a hosted error tracker now: enough for under 50 users; revisit in spec #10 if thin.
- **No test framework at Alpha** over adding Vitest now: the Alpha tier proves features with `/check verify`.
- **Direct `@google/genai` SDK** (your pick) over the Vercel AI SDK (`generateObject` with zod): the AI SDK would handle schema conversion and swap providers easily, but the official SDK has documented YouTube URL input, the one capability this stack is built around.
- **Region `eu-central-1` + Vercel `fra1`** (your pick) over US East defaults: the database and functions must sit together, and your audience is in Europe.
- **75 s application deadline with `maxDuration = 90`** over the 60 s limit first written: the platform limit is a chosen number (Hobby with Fluid compute allows more), and the app needs its own deadline below it so it can always record the outcome. Web pages keep a budget under 60 s to meet the scope.

Knowledge note: model names, SDK versions and free tier limits come from knowledge as of mid 2026 (no web check was run). Verify current Gemini Flash model ID, pricing, and Supabase and Vercel free tier limits at scaffold time.

## Review findings (2026-09-27)

An independent review raised six findings after the first draft. Each was weighed against the demo scope; none adds a queue, a service, an ORM or search infrastructure.

| Finding | Disposition | What changed |
|---|---|---|
| Arbitrary page fetching has no security boundary (SSRF, oversized responses) | **Accepted, kept minimal** | One `safeFetch` helper with scheme, port, destination, redirect, size and content type rules. The destination check runs at connect time through `undici`, since checking DNS before `fetch` leaves a rebinding gap and Vercel functions expose a runtime API on loopback. YouTube never goes through it: only a rebuilt canonical URL reaches Gemini. |
| Headline feature treated as proven | **Accepted** | The YouTube half of the decision is now conditional on a scripted spike (5 videos, 3 completed runs each, named model, pass and fail criteria, evidence recorded here). A failed spike reopens only the YouTube row; web pages are unaffected. |
| Timeout arithmetic is not an end to end deadline | **Accepted, modified** | One 75 s application deadline passed as an `AbortSignal`, per step budgets, 10 s always kept for finishing, one bounded Gemini retry, and the attempt row written before external work so interrupted requests stay visible. `maxDuration` raised to 90 rather than adding a queue. The "under a minute" target applies to web pages only, as in the scope. |
| Cost guard is not concurrency safe or complete | **Accepted, modified** | Atomic reservation in one `SECURITY DEFINER` function under an advisory lock; failures count; limits per operation kind (covering #12) plus an app wide limit. **Addition beyond the review**: the limits live in the database, not env vars, because a signed in user can call the function directly with the publishable key. The spend cap and alert amounts are now stated. Per call token and text bounds added. |
| No shared ingestion and acceptance contract | **Accepted** | Four outcomes (`recipe`, `not_a_recipe`, `insufficient`, `ingestion_failed`); only `recipe` is saved, atomically. Missing quantities stay empty, never guessed. Text sources get a cheap grounding check. The provider schema lets the model decline instead of forcing it to fill fields. |
| "Full JSON Schema" claim is wrong | **Accepted** | Three separate schemas. The provider facing one is restricted to a documented safe subset and verified in the spike; rich rules live only in the application schema. |

**Deferred, on purpose**:
- Grounding for video sources (no text to check against); measured by the spike, corrected by #13 Edit.
- An automated wake up for the idle Supabase project (you chose manual).
- Refunding quota for failures caused by the provider: simpler to count every attempt at this scale.


## Evidence: Gemini YouTube spike (2026-09-27)

The spike ran as [index.md](index.md) specifies under *Gemini YouTube feasibility spike*: five videos, one per failure mode, three completed runs each, through `scripts/spike-gemini-youtube.ts` with the real provider schema and prompt.

### Run configuration

| Setting | Value | Where it comes from |
|---|---|---|
| Videos | The five in `scripts/spike-gemini-youtube.ts` | the script |
| Runs per video | 3, rerun cap 2 | the script (`RUNS_PER_VIDEO`, `MAX_RERUNS`) |
| Step deadline | 55 s per call | the script (`STEP_BUDGET_MS`) |
| Media resolution | `MEDIA_RESOLUTION_LOW` | the script (`MEDIA_RESOLUTION`) |
| Thinking budget | 0 | the script (`THINKING_BUDGET`) |
| Provider schema | Accepted, never rejected | the run |

Not captured in this run, and still owed before any rerun: the exact model ID and API version used, per call latency for every call (only the maximum was noted), input and output token counts, cost per call at the paid tier rate published that day, and the observed quotas and input limits (longest video accepted). None of them change the verdict below, which fails on grounding, but a rerun needs them.

### What the run returned

| # | Video | Expected | Returned | Shape | Grounding |
|---|---|---|---|---|---|
| 1 | Long cooking video, recipe spoken | `recipe` | `recipe` 3/3 | **Run 3 failed**: 18 ingredients, 0 steps | **Pass** |
| 2 | Short, recipe spoken or on screen | `recipe` | `recipe` 3/3, no quantities in the latest run | Pass | **Fail** |
| 3 | Cooking demonstration, nothing spoken or written | `recipe` | `recipe` 3/3, no quantities in the latest run | Pass | Not reviewed by hand |
| 4 | Food vlog, nothing to cook from | `insufficient` | `insufficient` 3/3 | not applicable | not applicable |
| 5 | Non food video | `not_a_recipe` | `not_a_recipe` 3/3 | not applicable | not applicable |

Call buckets across the whole matrix: 0 `transient`, 0 `too_slow`, 0 `error`. Every video reached 3 completed runs with no rerun needed. Maximum latency was about 7 s against the 55 s step deadline, so speed was never close to a problem.

Read that 0 transient count beside the earlier run already recorded in [index.md](index.md) (*the transient rate is evidence, not background*), where run 2 lost 5 of 12 calls to 503. The rate moves between days, so spec #7 still designs for a provider that is sometimes unavailable. One clean day is not a promise.

### Manual grounding review

Checked by hand against the source, following the manual grounding check in [index.md](index.md).

**Video 1: pass.** The main ingredients match the source. The quantities match. The times and temperatures match. Nothing meaningful was invented.

**Video 2: fail.** Classification as `recipe` was right, and most ingredients were identified correctly. The temperature was grounded from the video or its description. Three things then broke the check:

- A concrete cooking time was invented. The source gave only an internal meat temperature, so the time came from the model, not the video.
- Mustard was reported and is not in the source. It looks inferred from the color of the glaze.
- White miso was missed, and it is a main ingredient by the rule, because it changes what the dish is.

Chilli is uncertain: some flakes or leaves were visible but not confidently identifiable, so it counts neither for nor against.

The result is structurally valid and reads like a real recipe. That is what makes it dangerous: from the output alone, nothing looks wrong.

### The pass rules applied

| Rule | Result |
|---|---|
| Classification: videos 1, 2 and 3 return `recipe` in at least 2 of 3 completed runs; 4 and 5 never return `recipe` | **Pass**, 15 of 15 runs on the expected outcome |
| Grounding: every `recipe` run passes the manual check | **Fail**, video 2 |
| Shape: every `recipe` run has a non blank title, at least 2 ingredients and at least 1 step | **Fail**, video 1 run 3 returned 0 steps |
| Speed: no `too_slow` calls | **Pass** |
| Schema: the provider accepts the restricted response schema | **Pass** |

### Verdict: Fail

Applying the outcome list in [index.md](index.md) in precedence order, the first match is outcome 1: *a recipe video fails grounding on video 1 or 2*. Video 2 invented a cooking time and an ingredient, so the spike fails.

Two details make this the correct reading rather than a harsh one:

- Video 2 is a case where the recipe is stated in the video. An invented time and an invented ingredient there mean the model filled gaps from appearance instead of reading the source, which is exactly what outcome 1 exists to catch.
- Outcome 2 (*pass with amounts dropped from video*) does not apply. It covers a grounding failure on video 3 alone, and this failure is on video 2. It is also not only about amounts: mustard is a whole ingredient that was never there, and dropping quantities would not remove it.

The shape failure on video 1 run 3 (18 ingredients, 0 steps) breaks the Shape rule on its own, so even without the grounding failure this run would not be a clean pass.

Classification is the strong result and is worth carrying forward: every one of the 15 completed runs landed on the expected outcome, including `insufficient` 3/3 on the food vlog and `not_a_recipe` 3/3 on the non food video. Gemini tells these three cases apart reliably. What it did not do is stay inside the source when it writes the recipe out.

### What this means for feature #7

Following *On Fail* in [index.md](index.md). Feature #7 is not redesigned here; that is a separate `/architect` run.

- Do not build feature #7 on Gemini video as this spec specifies it. The YouTube extraction row is now a closed conditional that failed, not a live decision.
- A `/architect` run owes the supersede of that row. The fallback this spec names is the video description through the YouTube Data API plus text extraction, which can be grounded against real text. Treat it as that run's starting point, not as a decision made here.
- Feature #6 (recipe from a web page link) is unaffected. It never depended on this spike, and text sources keep the grounding check.
- Three findings carry into whatever replaces the row: classification is reliable, latency sits far inside budget, and the invented values come from the writing step rather than the watching step. So the direction the evidence points is an approach that gives the model real text to ground against, or that drops any field it cannot ground.
- The demo story changes, as Consequences warned it would. Better to say so now than at the demo.
