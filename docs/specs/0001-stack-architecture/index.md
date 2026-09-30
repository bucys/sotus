# 0001. Next.js, Supabase and Gemini stack on Vercel

**Date**: 2026-09-27
**Status**: In Progress

## Summary

Sotus is built as one Next.js web app on Vercel. It uses Supabase for the database and Google sign in, and Google Gemini Flash to turn links into recipes. Gemini is expected to read a public YouTube video straight from its URL, which would avoid transcript scraping (cloud servers often get blocked from it). That expectation is unproven, so a small test run (a feasibility spike) must pass before the YouTube feature depends on it. Web page links go through one guarded fetch step; YouTube links take a separate guarded path where only a rebuilt, canonical video URL is ever sent to Gemini and the link you pasted is never fetched or forwarded. Every AI call reserves quota in the database first, and only a recipe that passes one shared set of checks is ever saved.

## Decision

**Chosen option**: Option 1: Next.js + Supabase + Gemini on Vercel (a single app, often called a monolith)

Build Sotus as one Next.js App Router app on Vercel. Supabase provides Postgres, Google sign in and row level security (database rules that decide who may read or change each row). Recipe extraction runs synchronously inside a Server Action (a server function a form calls directly) under one shared deadline. It calls Gemini Flash through the official `@google/genai` SDK. The YouTube half of this decision is **conditional on the Gemini YouTube spike** below.

**Implementation skills**: `supabase` (`~/.claude/skills/supabase/`) · `supabase-postgres-best-practices` (`~/.claude/skills/supabase-postgres-best-practices/`) · `vercel-react-best-practices` + `vercel-composition-patterns` + `deploy-to-vercel` + `vercel-cli-with-tokens` (`vercel-labs/agent-skills`, `.claude/skills/<name>/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

**MCP servers** (connect yourself): Vercel MCP (`claude mcp add --transport http vercel https://mcp.vercel.com`) · Next.js devtools MCP (built into the Next.js 16 dev server, `vercel/next-devtools-mcp`)

## Rationale

Reasoning, options, and how each review finding was handled: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture | Single Next.js app (monolith), no separate backend service | Under 50 users and one builder; one deployable unit is the easiest to build, debug and show in a course. |
| Language | TypeScript (strict) | Your default stack; one language from database types to UI. |
| Runtime | Node.js 24 LTS (long term support) on Vercel, Fluid compute on | Current LTS; set in `package.json` `engines` and Vercel project settings so local and deploy match. |
| Framework | Next.js, latest stable (16.x), App Router, Turbopack | Your default; Server Components keep pages light on phones. |
| Styling | Tailwind CSS v4 | Your default; tokens come from spec #4 Design system. |
| UI components | shadcn/ui (copied in components built on Radix), initialized with the `radix-nova` style, `neutral` base color, CSS variables on and `lucide` icons (as set in `components.json`) | Accessible dialogs, menus and focus handling out of the box; you own and restyle the code. Spec #4 replaces the neutral default tokens. |
| Motion and icons | Framer Motion, lucide-react | Your default; use sparingly. |
| Package manager | pnpm, version pinned with the `packageManager` field (corepack) | Fast, strict about missing dependencies, native on Vercel; the pin makes local and Vercel builds use the same pnpm. Commit `pnpm-lock.yaml`. |
| Primary database | Supabase Postgres | Recipes, owners and collections are relational; row level security matches "everyone reads, only the owner edits". |
| Data access | `@supabase/supabase-js` + `@supabase/ssr`, types from `supabase gen types typescript`; multi table writes through Postgres functions (RPC) | One client that carries the user's session, so every query runs under RLS. No ORM. |
| Migrations | Plain SQL files in `supabase/migrations/`, applied with the Supabase CLI (`supabase db push`) | Versioned, reviewable, the same SQL runs on dev and prod. |
| Auth | Supabase Auth, Google provider only, PKCE flow (a safer code exchange for sign in redirects) via `@supabase/ssr` cookies | No email sending needed; one tap on phones. Built into the platform already chosen. |
| API shape | Server Actions for all app writes (add link, save, edit); one Route Handler for `/auth/callback` | Least code in App Router. A REST API is added only if a native app arrives later. |
| Validation | zod (v4), three separate schemas: link input, provider response, accepted recipe | Each boundary has different rules; see *Schemas* below. |
| AI provider | Google Gemini Flash (exact model ID in `GEMINI_MODEL`, fixed by the spike) via `@google/genai` | Expected to read public YouTube URLs directly; cheap; structured JSON output. Paid tier (billing on) so prompts are not used for training. |
| Link fetching | One guarded fetch helper (`safeFetch`) for every user supplied web page URL, built on `undici` so the address is checked at connect time | Stops server side request forgery (SSRF: tricking the server into calling internal addresses) and oversized downloads. See *Ingestion boundary*. New dependency: `undici`. |
| Web page extraction | `safeFetch` the HTML, read schema.org `Recipe` JSON-LD first, fall back to Gemini on the page text; both paths pass the same acceptance contract | Most recipe sites publish structured data: free, fast and exact. Details in spec #6. |
| YouTube extraction | Parse the video ID, rebuild the canonical `https://www.youtube.com/watch?v=<id>` URL, send only that to Gemini as file input; title and thumbnail from YouTube oEmbed | No transcript scraping, and no user supplied URL ever reaches Gemini. **Superseded by [0002](../0002-recipe-from-youtube-link/index.md)** after the spike failed on 2026-09-27: a text first ladder (creator page JSON-LD, description via the YouTube Data API, then a gated grounded transcript); oEmbed is dropped. |
| Background jobs | None. Extraction runs synchronously in the Server Action under one 75 s deadline (`maxDuration = 90`) | Traffic is tiny; a queue adds a service and states with no measured need. Revisit only if the spike or real use shows the deadline is missed. |
| AI cost guard | Atomic quota reservation in Postgres before any paid work: per user daily limits per AI operation plus one app wide daily limit; Google Cloud budget alert and spend cap | Concurrency safe, covers every AI call (extraction and #12 cook picks), and counts failures too. See *Cost guard*. |
| File storage and images | None stored | No uploads in scope. YouTube thumbnails (`i.ytimg.com`) use `next/image` via `images.remotePatterns`; recipe site images come from unknown hosts, so they use a plain `<img>` (details in spec #6). |
| Search | Postgres built in (`ilike` or full text), decided in spec #14 | No search engine until the database cannot keep up. |
| Email | None | Google only sign in sends no mail. |
| Observability | Vercel runtime logs with one line JSON logs from the server; every AI and extraction attempt recorded in the database with its outcome (shared with spec #10) | The attempt record doubles as quota accounting and failure tracking. Add a hosted error tracker only if logs prove too thin. |
| Hosting | Vercel Hobby on your personal account, Git integration: `main` deploys to production, pull requests get preview URLs. Functions pinned to region `fra1` (Frankfurt) | Free, zero ops, previews for every change. `fra1` sits next to the database; Vercel's default `iad1` (US East) would add a transatlantic hop to every query. Hobby is for non commercial use, which fits a course demo. |
| Environments | **One** Supabase cloud project, `sotus-dev`, in `eu-central-1` (Frankfurt). All three Vercel environments (Development, Preview, Production) point at it. A second `sotus-prod` project is added only when real recipes are worth protecting from a broken migration | Free plan allows two active projects per organization and `bucys Org` already holds two others, so a second Sotus project means a new organization or pausing one. A demo does not need that yet. **Do not create a production Supabase project unless this row says so.** |
| Repository | Dedicated **public** GitHub repo on your personal account, moved out of `AI_WORKSPACE` | Clean Vercel import, own history; course viewers can follow the code. Secrets live only in env vars, never in the repo. |
| Testing | None required at the Alpha tier; each feature is proven with `/check verify`. The spike is a script, not a test suite. Vitest is added if a feature moves to Beta | Matches the workflow tier; avoids test setup before there is code to test. |

### Architecture rules the build must honor

- **Server first.** Pages are Server Components. A component becomes a client component (`"use client"`) only for interaction (forms with pending state, menus, motion).
- **Secrets stay on the server.** `GEMINI_API_KEY` is read only in server code (`import "server-only"` in `src/lib/ai/`). Only `NEXT_PUBLIC_` variables reach the browser.
- **RLS is the security boundary.** Every table has RLS on. The app uses the publishable key plus the user's session. No secret (service role) key in the app. Accounting data is written only through `SECURITY DEFINER` Postgres functions (functions that run with their owner's rights and do their own checks).
- **Trust the server check, not the cookie.** Server code identifies the user with `supabase.auth.getUser()` (or `getClaims()`), never `getSession()` alone. Signed out visitors are redirected to sign in by the Next.js request proxy (`proxy.ts`, formerly `middleware.ts`), which also refreshes the session cookie.
- **Web page URLs go through `safeFetch`.** No other code calls `fetch` on a user supplied web page URL.
- **YouTube URLs take a separate guarded path.** Parse the video ID, rebuild the canonical `https://www.youtube.com/watch?v=<id>` URL, and send only that canonical URL (or the bare ID) onward. The original user supplied YouTube URL is never fetched and never forwarded anywhere. The services it goes to are set by [0002](../0002-recipe-from-youtube-link/index.md) (YouTube Data API and Gemini; oEmbed dropped).
- **Reserve before cost.** No page fetch or Gemini call starts without a successful quota reservation.
- **Only an accepted recipe is saved.** Every source, JSON-LD or Gemini, returns one of the four outcomes in the *Acceptance contract*; only `recipe` is written, in one atomic database call.
- **One deadline, passed everywhere.** Each extraction creates one `AbortSignal` with the 75 s deadline and passes it to every step.

### Ingestion boundary (`src/lib/extraction/safe-fetch.ts`)

One helper for user supplied web page URLs; no other code fetches them. YouTube URLs never enter it (see the note below the table).

| Rule | Value |
|---|---|
| Schemes and ports | `http` and `https` only; ports 80 and 443 only; no credentials in the URL; URL at most 2048 characters |
| Destination check | Every resolved address (IPv4 and IPv6, including IPv4 mapped IPv6) must be public. Reject loopback, private, link local (includes `169.254.169.254`), carrier grade NAT, multicast, unspecified and reserved ranges. The check runs inside the `undici` Agent's `connect` lookup, so it applies to the address actually dialed (closes DNS rebinding, where a name resolves to a safe address first and an internal one later) |
| Redirects | `redirect: "manual"`; follow at most 3; each hop's URL goes through the same scheme, port and destination rules |
| Response limits | Accept only `text/html` or `application/xhtml+xml`; stream the body and abort past 2 MB; 8 s total including redirects |
| Request hygiene | `GET` only; no cookies or auth headers forwarded; fixed `User-Agent` naming Sotus |
| Result | Either the HTML plus the final URL, or `ingestion_failed` with a reason (`blocked_url`, `too_many_redirects`, `too_large`, `unsupported_content`, `fetch_failed`, `timeout`) |

**YouTube path (separate guard, superseded in detail by [0002](../0002-recipe-from-youtube-link/index.md)):** YouTube links never pass through `safeFetch` (links found in a video's description are ordinary web page URLs and do). The video ID is parsed from the pasted link (a link with no valid ID is `ingestion_failed`, `blocked_url`), the canonical `https://www.youtube.com/watch?v=<id>` URL is rebuilt, and only that URL goes to Gemini and to oEmbed on the fixed `youtube.com` host. The original pasted URL is never fetched and never forwarded.

### Acceptance contract (`src/lib/extraction/contract.ts`)

Every extraction, from any source, ends in exactly one outcome:

| Outcome | Meaning | Saved? | User sees |
|---|---|---|---|
| `recipe` | Passed every acceptance rule below | Yes, atomically (recipe, ingredients, steps in one database call) | The new recipe page |
| `not_a_recipe` | The source is not a recipe (a vlog, a review, a non food page) | No | "This link does not contain a recipe." |
| `insufficient` | Food related, but not enough to cook from (no ingredient list, or no steps) | No | "We found cooking content but not a full recipe." plus what was missing |
| `ingestion_failed` | Could not get or read the content (blocked link, timeout, video unavailable, provider error, quota exceeded, invalid model output) | No | A plain message per reason |

Acceptance rules, applied identically to JSON-LD results and Gemini results:
- Title is present and not blank.
- At least 2 ingredients and at least 1 step, each non blank.
- Every ingredient has a name. Quantity and unit are optional and stay **empty when the source does not state them**; they are never guessed. The page shows "amount not given".
- **Grounding for text sources**: when Gemini extracted from page text, each ingredient name must appear in that text (case and plural insensitive). Ingredients that do not are dropped, then the counts above are checked again. Video sources cannot be grounded this way; the spike measures how often Gemini invents amounts from video.
- JSON-LD: use the first `Recipe` node (including inside `@graph`) that has both ingredients and instructions; flatten `HowToSection` and `HowToStep`. JSON-LD that fails the rules falls back to Gemini on the page text; it is not saved as is.
- The model is told to use only what the source states, and its response schema lets it answer `not_a_recipe` or `insufficient` instead of forcing it to fill every recipe field.

### Schemas (zod v4, `src/lib/extraction/schemas.ts`)

- **Link input** (form): one string, a valid `http` or `https` URL, at most 2048 characters, trimmed.
- **Provider response** (sent to Gemini as `config.responseJsonSchema`): shaped for what Gemini supports, not for every rule. It uses only objects, arrays, strings, integers, enums, `required` and `description`. No `$ref`, unions, string formats, patterns or length and count limits, and at most 3 levels deep. It carries `outcome` (`recipe`, `not_a_recipe`, `insufficient`), an optional `reason`, and the recipe fields. Convert it with `z.toJSONSchema`, strip `$schema` and `additionalProperties`, and confirm in the spike that the chosen model accepts it. Gemini supports a subset of JSON Schema, so no claim of full compatibility is made.
- **Accepted recipe** (application): the full acceptance rules above (counts, non blank text, trimmed lengths). Every provider response and every JSON-LD result is parsed by this schema before saving. A parse failure is `ingestion_failed` (`invalid_model_output`), never a partial save.

### Deadline and failure recording

| Step | Budget |
|---|---|
| Whole extraction (application deadline) | 75 s from request start; `maxDuration = 90` gives the platform 15 s of margin |
| Auth check + quota reservation | 2 s |
| `safeFetch` (web pages) | 8 s including redirects |
| Gemini on page text (web fallback) | 30 s. So the web page path stays under 60 s, meeting scope #6's "under a minute" |
| YouTube oEmbed | 3 s |
| Gemini on video | 55 s, or less if the spike shows it is needed to hold the deadline. The scope sets no time limit for YouTube; the spike records real latency |
| Finish (save or record the failure) | At least 10 s is always kept: a step that cannot finish before `deadline minus 10 s` is not started, and the outcome becomes `ingestion_failed` (`timeout`) |

- **Retries**: none, except one retry of a Gemini call on a transient error (HTTP 429, 500 or 503), and only if its full step budget still fits before `deadline minus 10 s`. The retry does not reserve new quota.
- **Record first**: the quota reservation inserts the attempt row (status `started`) before any external call. The finish step sets it to the final outcome and reason. A row still `started` more than 2 minutes after creation is shown as `interrupted` (derived when read; no cleanup job). Such a row still counts against quota.

### Cost guard

- **One attempt table, two Postgres functions** (exact columns designed in spec #3; spec #10 reads it):
  - `reserve_ai_attempt(kind, source_url)`: takes a transaction scoped advisory lock (a database lock that serializes these reservations app wide; trivial at this traffic). It counts today's attempts (UTC day, from the database clock) for this user and this `kind`, and today's attempts app wide. If both are under their limits, it inserts a `started` row owned by `auth.uid()` and returns its id; otherwise it raises `quota_exceeded`.
  - `finish_ai_attempt(id, outcome, reason, input_tokens, output_tokens)`: only on the caller's own `started` row.
  - Both are `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only. The table has RLS: users may read their own rows; there are no insert, update or delete policies, so the accounting fields cannot be changed directly.
- **Every attempt counts**, success or failure, because a failed call may still have cost money. JSON-LD successes count too; the limit is on attempts, which keeps it simple.
- **Limits live in the database** (constants in `reserve_ai_attempt`, changed by a migration), not in env vars, because a signed in user can call the function directly and it must not trust limits passed in.
- **These numbers are initial operational safety defaults, not product or business rules.** They are configurable (one migration changes them) and should be revisited after the Gemini YouTube spike and once real usage and cost are measured.

| Scope | Initial default per UTC day |
|---|---|
| `extract_web` + `extract_youtube` (shared), per user | 20 |
| `cook_pick` (spec #12), per user | 30 |
| All kinds, all users (app wide) | 300 |

- **Per call bounds**: page text sent to Gemini is cut to 60,000 characters; `maxOutputTokens` 4096 on every call; video calls use the lowest media resolution that the spike shows still reads on screen quantities; the thinking budget is set to the lowest value that passes the spike.
- **Provider side** (initial demo billing safeguards): a Google Cloud budget alert at €5 a month, and a project spend cap at €10 a month where the account offers one. Enforcement can lag and overage is still billed, so the in app limits above are the real guard.

### Gemini YouTube feasibility spike (gates spec #7, not the scaffold)

**Superseded by [0002](../0002-recipe-from-youtube-link/index.md)**, which reuses the videos, buckets, rerun cap and pass rules below for its spike 2.

**Result, 2026-09-27: Fail.** The run, the manual grounding review and the verdict are recorded in [rationale.md](rationale.md) under *Evidence: Gemini YouTube spike*. Classification, speed and schema passed; grounding failed on video 2 (an invented cooking time and an invented ingredient) and shape failed on one run of video 1. The rules below stay exactly as written, because a rerun or a replacement design is judged against them.

A throwaway script, `scripts/spike-gemini-youtube.ts`, run locally against the paid tier key and the exact model ID intended for `GEMINI_MODEL`, using the real provider schema and prompt.

Five videos, chosen so each one probes a different way the extraction can fail. The first two ask whether a stated recipe survives the round trip. The third asks whether a recipe can be rebuilt from watching alone, which is the capability that makes the YouTube demo worth having. The last two ask whether the model can tell "food, but not cookable" from "not food", because the acceptance contract gives those two outcomes different messages.

| # | Video | Expected outcome | What it proves |
|---|---|---|---|
| 1 | A typical 8 to 15 minute cooking video, recipe spoken | `recipe` | The easy case works end to end |
| 2 | A Short with the recipe spoken or shown on screen, not in the description | `recipe` | Short form works without the description |
| 3 | A cooking demonstration with no spoken and no written recipe | `recipe` | Visual reconstruction: the model can read a recipe off the cooking itself |
| 4 | Food content with nothing to cook from (a tasting video, a review, a montage with no method) | `insufficient` | Food content is not mistaken for non food, and not forced into a recipe |
| 5 | A non food video | `not_a_recipe` | The outer boundary holds |

Run each 3 times. Every call ends in exactly one of four buckets:

| Bucket | Meaning | Counts as |
|---|---|---|
| `completed` | The provider returned an answer | The sample the classification and grounding rules are judged on |
| `transient` | HTTP 429, 500 or 503, still failing after one retry | Provider load, not a wrong answer. Recorded, then the video is rerun |
| `too_slow` | The call was cut off at the 55 s step deadline | A speed failure. Never silently dropped, and never counted as a wrong answer |
| `error` | Anything else (bad schema, malformed output, network) | A real failure, investigate before judging the spike |

**Rerun cap.** A video short of 3 completed runs is rerun, at most twice. Still short after that, it is **inconclusive**, which is a fail for a recipe video and is recorded as such. Without a cap a bad provider day loops forever and spends real money.

Record in `rationale.md` under *Evidence: Gemini YouTube spike*: model ID and API version, schema accepted or not, per run latency, input and output tokens, cost per call (priced at the paid tier rate published for the exact model ID on the day of the run, quoted in the evidence), transient and `too_slow` counts, observed quotas and input limits (maximum video length accepted), media resolution and thinking settings used, and each run's outcome with ingredient accuracy.

**Pass** when all of the following hold:
- **Classification.** All three recipe videos (1, 2, 3) return `recipe` in at least 2 of 3 completed runs. Videos 4 and 5 never return `recipe` in any completed run.
- **Grounding.** Every `recipe` run passes the manual check below. A missing amount is correct and expected; an invented one is a failure.
- **Shape.** Every `recipe` run has a non blank title, at least 2 named ingredients and at least 1 step. Matching the expected outcome is not enough on its own.
- **Speed.** No `too_slow` calls. Because the script cuts a call off at 55 s, a slow call can never appear as a slow completed run, so `too_slow` is the only place slowness shows up.
- **Schema.** The provider accepts the restricted response schema.

**The manual grounding check** (write down the result per run, so a second person reaches the same verdict):
1. Watch the video once at normal speed. Write down every ingredient it names out loud or shows in writing, with the amount if one is given.
2. A **main ingredient** is anything that goes into the dish and changes what it is. Salt, pepper, oil for the pan, water, and anything the video calls "to taste" are excluded.
3. Compare. Every main ingredient on your list must be in the model's answer. Every amount in the model's answer must be on your list. An amount the model gives that you did not write down is invented, and the run fails.
4. **A stable variance report is not a passed grounding check.** The script only flags amounts that change between runs. A model that invents the same wrong amount all three times prints as stable. That is the more likely failure, and only step 3 catches it.

**Outcomes, in precedence order** (apply the first that matches):
1. **Fail.** A recipe video is inconclusive, or fails classification, or fails grounding on video 1 or 2, or any `too_slow` call, or the schema is rejected. Videos 1 and 2 state their amounts out loud, so an invented amount there means the model is not reading the source at all.
2. **Pass with amounts dropped from video.** Everything passes except grounding on video 3 alone. Keep visual reconstruction, but spec #7 saves no quantities or units from a video only source; every ingredient shows "amount not given". Silent demotion, not a blocker.
3. **Partial pass.** Video 4 returns `not_a_recipe` instead of `insufficient`, while never returning `recipe`. Nothing wrong is saved, so this does not block building on Gemini video, but the two user messages cannot be told apart from the model's answer. Spec #7 either keeps prompting for the distinction or merges the two messages into one.
4. **Pass.** Everything above holds.

**On Fail**: do not build spec #7 on Gemini video. Rerun `/architect` to supersede the YouTube extraction row (the likely fallback is the video description via the YouTube Data API plus text extraction; not built now). Web page extraction (#6) does not depend on this spike.

**The transient rate is evidence, not background.** Run 2 lost 5 of 12 calls to 503. Spec #7 must design for a provider that is sometimes unavailable, because a synchronous 75 s wait that then fails is a bad experience. Carry the observed rate into that spec.

Video 3 deserves the closest reading. It is the strongest demo result if it passes, and also the highest grounding risk: with nothing spoken and nothing written, there is no stated amount anywhere, so every quantity the model returns is one it produced itself. That is why outcome 2 exists: the sensible answer to a video 3 grounding failure is to keep visual reconstruction and drop amounts, not to abandon Gemini.

### Folder layout

Follows your default structure; new folders only where the stack needs them.

```
src/
  app/                    routes; (auth)/sign-in, auth/callback/route.ts
  components/             shared UI; components/ui/ holds shadcn/ui
  lib/
    supabase/             server.ts, client.ts, proxy helper, database.types.ts
    ai/                   gemini.ts (server only client + model config), quota.ts (reserve/finish calls)
    extraction/           safe-fetch.ts, contract.ts, schemas.ts, web and YouTube pipelines
  data/                   static content
  proxy.ts                session refresh + sign in redirect
scripts/
  spike-gemini-youtube.ts feasibility spike (throwaway)
supabase/
  migrations/             SQL migrations
```

### Configuration required

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (per environment) + `.env.local` | Supabase project URL. The same `sotus-dev` value in all three Vercel environments while there is one project. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same | Public client key; safe in the browser because RLS guards the data. |
| `GEMINI_API_KEY` | Vercel (server) + `.env.local` | Gemini API access, from a billing enabled Google AI Studio or Cloud project. |
| `GEMINI_MODEL` | same | Exact Gemini Flash model ID confirmed by the spike, so upgrading the model is a config change. |

Quota limits are not env vars (see *Cost guard*). Set up with the Gemini key during the scaffold: billing on, the €5 budget alert and the €10 spend cap. Set up in **spec #5 Sign in, not the scaffold**: the Google OAuth client ID and secret (Supabase Auth settings, one OAuth client for the one project), and the Supabase Site URL and redirect allow list on `sotus-dev`, holding the production URL, `http://localhost:3000/**` and the Vercel preview wildcard together. Commit a `.env.example` listing the variables without values.

### Scaffold scope (for `/develop stack & architecture`)

The feature's "done when" is an empty scaffold that runs locally, builds clean and is live at a shareable URL. So the scaffold covers: the new repo, the Next.js app with the stack above installed and configured, shadcn/ui initialized (`radix-nova` style, `neutral` base color, CSS variables), the Supabase clients and `proxy.ts` wired to the one `sotus-dev` project, the empty `supabase/migrations/` folder, `.env.example`, Gemini billing and caps, and the Vercel project (region `fra1`) with its environment variables set. The Gemini YouTube spike runs alongside it. The scaffold does **not** build sign in or configure Google OAuth (#5), tables or the quota functions (#3), `safeFetch` and extraction (#6, #7), or the design system (#4). Those features build to the rules in this spec.

## Consequences

**Positive**:
- One app, one deploy, one language: easy to follow in a course and cheap to run.
- Authorization lives in the database (RLS), so a missed check in app code cannot leak or overwrite another person's recipe.
- One guarded fetch step for web pages, one canonical URL rule for YouTube, one acceptance contract and one quota function mean each safety rule lives in exactly one place.
- If the spike passes, the YouTube demo works without transcript scraping, the most fragile part of this kind of app.
- Swapping the Gemini model is a config change (`GEMINI_MODEL`).

**Negative / tradeoffs**:
- **The headline feature is unproven until the spike passes.** If it fails, spec #7 needs a new approach and the demo story changes.
- **Strict acceptance rejects some real recipes** (for example one with a single ingredient, or ingredients the page names differently from the model). A false "not a full recipe" is the price of never saving an invented one.
- **Video extraction cannot be grounded** against text; wrong amounts from video remain possible and are only measured by the spike and corrected by #13 Edit.
- **Failures cost quota.** A user whose links keep failing hits the daily limit sooner.
- **Synchronous extraction** keeps the user waiting up to 75 s on a slow video. Moving to a background job later means adding a status to recipes.
- **One new dependency** (`undici`) for connect time address checks, and hand written SQL functions for quota that spec #3 must get right.
- **Supabase free projects pause after about a week without activity.** You chose to handle this by hand: open `sotus-dev` in the Supabase dashboard before any demo, or the first request fails.
- **RLS policies must be right.** A wrong policy is a real security bug; spec #3 must include policy tests (checks run as two different users).
- **Server Actions are not a public API.** A future native app (deferred) will need Route Handlers added.
- **Vercel Hobby is non commercial only.** Charging for Sotus would require the Pro plan.
- **One Supabase project** means local work, previews and production share a database: a broken migration or a wiped table hits the demo too, and there is no safe place to try a migration first. The trade is one migration push instead of two and one OAuth client instead of two. Split into `sotus-dev` and `sotus-prod` before Sotus holds recipes anyone would miss.

**Neutral**:
- New patterns to learn: RLS policies, `SECURITY DEFINER` functions, the `@supabase/ssr` cookie flow, Gemini structured output.
- The Vault's earlier Expo native direction stays deferred; nothing here blocks it, but it would need an HTTP API.

## Follow-up

- [ ] Step 0, before `/develop`: create the public GitHub repo on your personal account and move the Sotus folder (docs, design, `.claude/skills/`) into it.
- [x] Run the Gemini YouTube spike and record its evidence in `rationale.md` before spec #7 is designed. It ran on 2026-09-27 and **failed** on grounding; the evidence and verdict are in `rationale.md`.
- [x] Owed by the failed spike: rerun `/architect` to supersede the YouTube extraction row. Done 2026-09-30 in [0002](../0002-recipe-from-youtube-link/index.md).
- [ ] Revisit the quota defaults (20 / 30 / 300) and billing safeguards (€5 alert, €10 cap) after the spike and again once real usage and cost are measured; change limits with a migration.
- [ ] Spec #3 Data model: the attempt table, `reserve_ai_attempt` and `finish_ai_attempt`, atomic recipe save (one Postgres function), and RLS policy tests.
- [ ] Spec #6 and #7: build to the ingestion boundary, acceptance contract, schemas and deadline in this spec; #6 also decides recipe site image handling.
- [ ] Spec #10: read failures and `interrupted` attempts from the attempt table rather than a separate log.
- [ ] Spec #12: reserve quota with `kind = cook_pick` before each AI call.
- [ ] No project `AGENTS.md` exists yet. When `/audit` (feature #2) creates it, list in `## Agent skills` (all project wide, root level): the user level `supabase` and `supabase-postgres-best-practices`, plus the project skills installed on 2026-09-27 in `.claude/skills/` (`vercel-react-best-practices`, `vercel-composition-patterns`, `deploy-to-vercel`, `vercel-cli-with-tokens`, `next-dev-loop`, `shadcn`). `MCP servers:` Vercel MCP, Next.js devtools MCP. `Declined:` Tailwind v4 docs and zod community skills, shadcn community MCP.
- [ ] In the new repo, check `.claude/skills/` is not ignored by git so the installed skills travel with the code.
- [ ] Before a demo: wake the `sotus-dev` Supabase project (it pauses when idle).
- [x] `scripts/spike-gemini-youtube.ts` now matches the spike rules above: it has a `too_slow` bucket, a rerun top up capped at 2, and it takes video ids as arguments so one video can be rerun alone. The 2026-09-27 run used this version, so its `too_slow` and rerun counts can be trusted.
- [ ] Spec #7 must handle links the spike does not cover: a very long video, a non English video, and a private, deleted or region blocked link. The spike answers whether Gemini can read a video at all, not whether it survives arbitrary user links.
- [ ] Split into `sotus-dev` and `sotus-prod` once Sotus holds recipes worth keeping. Needs a second Supabase organization or a paused project, then a second OAuth client, a second redirect allow list and every migration pushed twice. Until this is done, treat `sotus-dev` as the only Supabase project and do not create another.
