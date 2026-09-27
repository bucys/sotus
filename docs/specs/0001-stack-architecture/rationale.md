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
| Headline feature treated as proven | **Accepted** | The YouTube half of the decision is now conditional on a scripted spike (4 videos, 3 runs each, named model, pass and fail criteria, evidence recorded here). A failed spike reopens only the YouTube row; web pages are unaffected. |
| Timeout arithmetic is not an end to end deadline | **Accepted, modified** | One 75 s application deadline passed as an `AbortSignal`, per step budgets, 10 s always kept for finishing, one bounded Gemini retry, and the attempt row written before external work so interrupted requests stay visible. `maxDuration` raised to 90 rather than adding a queue. The "under a minute" target applies to web pages only, as in the scope. |
| Cost guard is not concurrency safe or complete | **Accepted, modified** | Atomic reservation in one `SECURITY DEFINER` function under an advisory lock; failures count; limits per operation kind (covering #12) plus an app wide limit. **Addition beyond the review**: the limits live in the database, not env vars, because a signed in user can call the function directly with the publishable key. The spend cap and alert amounts are now stated. Per call token and text bounds added. |
| No shared ingestion and acceptance contract | **Accepted** | Four outcomes (`recipe`, `not_a_recipe`, `insufficient`, `ingestion_failed`); only `recipe` is saved, atomically. Missing quantities stay empty, never guessed. Text sources get a cheap grounding check. The provider schema lets the model decline instead of forcing it to fill fields. |
| "Full JSON Schema" claim is wrong | **Accepted** | Three separate schemas. The provider facing one is restricted to a documented safe subset and verified in the spike; rich rules live only in the application schema. |

**Deferred, on purpose**:
- Grounding for video sources (no text to check against); measured by the spike, corrected by #13 Edit.
- An automated wake up for the idle Supabase project (you chose manual).
- Refunding quota for failures caused by the provider: simpler to count every attempt at this scale.

