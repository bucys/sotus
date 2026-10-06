# Scope: Sotus

Sotus turns a cooking video or recipe link into a clean, reusable recipe, keeps it in a shared library and your own collection, and helps you answer "what should I cook today?" This scope is the first version for a course demo; the bigger vision (meal plans, shopping lists, nutrition) lives in the AI_VAULT Sotus docs and stays deferred here.

**Build approach:** Skateboard (ship the smallest usable Sotus first, then grow it release by release, shippable at every step).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

**First version boundaries:** mobile first web app, English only, sources are YouTube (including Shorts) and recipe web pages. Everyone signed in can view every recipe; only the person who added a recipe can edit it; your collection is recipes you added or saved.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Sign in | Release 1 | done |
| 6 | Recipe from a web page link | Release 1 | planned |
| 7 | Recipe from a YouTube link | Release 1 | in-progress |
| 8 | Recipe page | Release 1 | planned |
| 9 | Shared recipe library | Release 1 | planned |
| 10 | Extraction error tracking | Release 1 | planned |
| 11 | Save to my collection | Release 2 | planned |
| 12 | What should I cook today | Release 2 | planned |
| 13 | Edit my recipe | Release 3 | planned |
| 14 | Search & filter | Release 3 | planned |

## Foundations

### 1. Stack & architecture · done
Decide the web stack, hosting, sign in approach, and AI provider, then scaffold a runnable project that deploys to a public URL.
**Done when:** the stack is recorded in a spec, and the empty scaffold runs locally, builds clean, and is live at a shareable URL.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `src/`, `supabase/`, `scripts/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
  - [x] Gemini YouTube feasibility spike, evidence recorded in spec 0001 `rationale.md` (gates #7, not the scaffold). Ran 2026-09-27, verdict **Fail** on grounding; superseded for #7 by spec [0002](../specs/0002-recipe-from-youtube-link/index.md).
- [x] Verify it: `/check verify stack & architecture`

### 2. Coding standards & tooling
Capture conventions from the real scaffold, then install lint, format, and type checks so every later feature follows them.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and type checks run clean.
- [x] Capture conventions + tooling choices: `/audit`

### 3. Data model · done
Users, recipes (ingredients, steps, source link, who added it), and each user's saved collection, shaped so later extras (tags, meal plans) fit without a painful migration.
**Done when:** a recipe can be stored with its source and who added it, only through Sotus's signed save, any signed in user can read it, no user can change it, and a user can save and unsave any recipe in their collection.
spec [0003](../specs/0003-data-model/index.md) · code in `supabase/migrations/`, `supabase/tests/`, `src/lib/recipes/`, `src/lib/ai/`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Schema and RPC migrations pushed to `sotus-dev`, types regenerated (AC-1 to AC-14)
  - [x] Publish secret in Vercel and Vault, `sign-payload.ts` and `attempt-reasons.ts` (AC-1, AC-3, AC-11)
  - [x] `supabase/tests/rls.sql` green, including privileges and URL keys (AC-15)
- [x] Verify it: `/check verify data model`
  - Deferred, non blocking for Alpha: real Google profile trigger and real account deletion (feature #5), UTC day boundary rollover, Vault secret mismatch, live tracking parameter saves. Listed in `docs/specs/0003-data-model/verify.md`.

### 4. Design system & UI foundation · done
Colors, type, spacing, and base components for a warm, mobile first kitchen feel (the earlier "Sodrus" direction in the Vault is a starting input, not a lock).
**Done when:** `design.md` covers tokens and core components, and base components meet contrast, focus, and keyboard basics at phone width.
spec [0004](../specs/0004-design-system-ui-foundation/index.md)
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] `docs/design.md` written (AC-1)
  - [x] Tokens, focus outline, type utilities, motion rules and fonts in `globals.css` and `layout.tsx` (AC-2 to AC-7, AC-14)
  - [x] `check:ui` guard, then the edited shadcn primitives and feedback components (AC-3, AC-4, AC-9 to AC-12, AC-15)
  - [x] App shell and the `/dev/ui` gallery (AC-8, AC-9, AC-13, AC-16)
- [x] Verify it: `/check verify design system & UI foundation`
  - Deferred, non blocking for Alpha: a real phone with the software keyboard and a real screen reader pass. The commit hook was exercised for real: a staged `.tsx` file with a banned class made `lint-staged` fail on `check:ui`. First verified on commit 306d091, verified again on 2026-10-01 after the review fixes; evidence in `docs/specs/0004-design-system-ui-foundation/verify.md`.

## Release 1: Link in, recipe out

The smallest usable Sotus: sign in, paste a link, get a clean recipe everyone can see.

### 5. Sign in · done
Simple sign in so recipes have an owner and the app knows whose collection is whose.
**Done when:** a person can sign up, sign in, and sign out on a phone; signed out visitors are sent to sign in.
spec [0005](../specs/0005-sign-in/index.md) · code in `src/lib/auth/`, `src/app/(auth)/`, `src/app/(app)/`, `src/app/auth/`, `src/components/auth/`
- [x] Design it (spec): `/architect sign in`
- [x] Build it: `/develop sign in`
  - [x] Setup, helpers and `requireUser()` (code done; Google and Supabase dashboard setup completed and verified in production): Google and Supabase settings, `safeNextPath`, auth classification, one guard for every protected entry point (AC-3, AC-7 to AC-10, AC-12)
  - [x] Sign in thread: private `(app)` layout, `/sign-in`, Server Action, `/auth/callback` (AC-1, AC-3, AC-4, AC-7, AC-8, AC-9, AC-11, AC-12)
  - [x] Proxy gate: GET and HEAD redirects, outage pass through, cookie preserving redirects (AC-2, AC-4, AC-8, AC-12)
  - [x] Account menu, Sign out and states (AC-5, AC-6, AC-7, AC-11)
- [x] Verify it: `/check verify sign in`

### 6. Recipe from a web page link · done
Paste a recipe page link and get a structured recipe (title, ingredients with amounts, steps, source). Simplest source, so it proves the extraction contract first.
**Done when:** pasting a typical recipe page link produces a saved recipe with ingredients and steps in under a minute, and a non recipe or broken link shows a clear message.
spec [0006](../specs/0006-recipe-from-web-page-link/index.md) · builds the shared base for #7 and ships together with #7 slice 1 · code in `src/lib/extraction/`
- [x] Design it (spec): `/architect recipe from a web page link`
- [x] Build it: `/develop recipe from a web page link`
  - [x] Slice A foundations: dependencies, reasons and messages, schemas, deadline, host rules and `safeFetch`, title, JSON-LD and ingredient readers, `pnpm check:extraction` (AC-1, AC-4, AC-5, AC-10, AC-11, AC-15, AC-17)
  - [x] Slice A thread: `addRecipeFromLink` with auth, dedup, quota and signed save, the "Add a link" form, the minimal recipe page (AC-1 to AC-3, AC-11 to AC-14, AC-16, AC-17)
  - [x] Slice B: page text, Gemini client and failure mapping, grounding, the fallback wired in (AC-6 to AC-10)
  - [x] Slice C: #7 slice 1 plugged into the same router (AC-15)
- [x] Verify it, together with #7 slice 1: `/check verify recipe from a web page link`

### 7. Recipe from a YouTube link · in-progress
Paste a YouTube video or Short and get the same structured recipe, so the recipe is no longer buried in the video. The headline demo moment.
**Done when:** pasting a YouTube cooking video or Short produces a saved recipe linked to the video; a video with no usable recipe content shows a clear message instead of a made up recipe.
spec [0002](../specs/0002-recipe-from-youtube-link/index.md) · builds after #3 and #6 · code in `src/lib/extraction/youtube/`
- [x] Design it (spec): `/architect recipe from a youtube link`
- [ ] Build it: `/develop recipe from a youtube link`
  - [x] Slice 1 foundations: YouTube key, link parsing and routing, duplicate check, Data API metadata (AC-1, AC-2, AC-3, AC-8, AC-13)
  - [x] Slice 1 extraction: grounding, creator page, description step, orchestration and save (AC-4 to AC-7, AC-9, AC-11, AC-12)
  - [x] Slice 1 UI: pending state, messages, provenance line and notice (AC-10)
  - [ ] Spike 2: grounded transcript on seven videos at two media resolutions, evidence in spec 0002 (gates slice 2)
  - [ ] Slice 2: grounded transcript step behind `YOUTUBE_TRANSCRIPT`, only if spike 2 passes, with its own `/check verify` (AC-14 to AC-18)
- [x] Verify it: `/check verify recipe from a youtube link`

### 8. Recipe page
One readable, cook friendly view of a recipe: ingredients, steps, source link, who added it.
**Done when:** a recipe reads well at phone width, the source link opens the original, and headings and contrast pass accessibility basics.
- [ ] Build it: `/develop recipe page`

### 9. Shared recipe library
The home list of every recipe anyone has added, newest first, each opening its recipe page.
**Done when:** a signed in user sees all recipes with title and source, can open any of them, and sees a friendly empty state with an "add a link" action.
- [ ] Build it: `/develop shared recipe library`

### 10. Extraction error tracking · needs a decision
Capture failures from link extraction so you know what broke before a demo does.
**Done when:** a failed extraction is recorded with the link and reason, and you can see recent failures.
- [ ] Design it (spec): `/architect extraction error tracking`

## Release 2: My collection + what to cook

Grows Sotus from a recipe converter into a personal cooking helper.

### 11. Save to my collection
Save any library recipe to your own collection; recipes you add are in it automatically.
**Done when:** a user can save and unsave a recipe, their collection shows only their added and saved recipes, and it stays after signing out and back in.
- [ ] Build it: `/develop save to my collection`

### 12. What should I cook today · needs a decision
Give a few optional hints (time you have, mood, ingredients on hand) and AI picks 1 to 3 recipes from your collection, each with a short reason.
**Done when:** with hints or none, a user gets 1 to 3 picks only from their own collection with a reason each; an empty collection gets a helpful nudge to add recipes.
- [ ] Design it (spec): `/architect what should I cook today`

## Release 3: Fix and find

Makes a growing collection trustworthy and easy to use.

### 13. Edit my recipe
Fix what the AI got wrong: title, ingredients, steps. Only the person who added the recipe can edit it.
**Done when:** the owner can edit and save changes, others see no edit option, and bad input is caught with a clear message.
- [ ] Build it: `/develop edit my recipe`

### 14. Search & filter · needs a decision
Find recipes by name or ingredient, and filter the library down to your collection.
**Done when:** typing a word narrows the list quickly, the "my collection" filter works, and no results shows a clear empty state.
- [ ] Design it (spec): `/architect search & filter`

## Deferred
Out of scope for the demo, kept so the plan stays honest.
- **TikTok, Instagram Reels, Facebook sources**: harder to fetch reliably · needs a decision
- **Tags and cook time filters**: richer filtering once recipes carry them
- **Serving scaling**: change servings and amounts update
- **Weekly meal plan**: plan the week from your collection · needs a decision
- **Shopping list and pantry**: merged, pantry aware list from the plan · needs a decision
- **Nutrition goals and tracking** · needs a decision
- **Chat with your collection**: free form cooking questions · needs a decision
- **Dark theme**: Sodrus dark values as the starting point, contrast checked again · from spec 0004
- **Tap to check off ingredients and steps** while cooking · from spec 0004
- **Lithuanian language** · needs a decision
- **Native mobile app with share sheet capture** · needs a decision
- **Public landing page with SEO**
- **Usage analytics** · needs a decision
- **Privacy and terms page**: add before real public users; Google account data is stored in the EU region · from spec 0005
- **Delete my account**: needs a server side admin step, which conflicts with no service role key, so design it first · from spec 0005 · needs a decision
- **Email magic link sign in**: for demo viewers without a Google account; needs a real email sender · from spec 0005 · needs a decision
- **YouTube API data policy check**: confirm how long video titles and channel names may be stored before any public launch · from spec 0002
- **YouTube metadata refresh or clear job**: refresh or clear `source_title` / `source_channel_title` past the allowed age, using `source_metadata_fetched_at`; launch gate · from spec 0003
- **Recipe images for web recipes**: needs a column and a decision on hotlinking unknown hosts · from spec 0006 · needs a decision
- **Microdata recipe reader**: only if #10 shows many pages without JSON-LD · from spec 0006
- **Admin fix path for canonical recipes**: correct, re-extract or remove a library recipe (users can't); launch gate · from spec 0003 · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
