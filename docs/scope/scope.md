# Scope: Sotus

Sotus turns a cooking video or recipe link into a clean, reusable recipe, keeps it in a shared library and your own collection, and helps you answer "what should I cook today?" This scope is the first version for a course demo; the bigger vision (meal plans, shopping lists, nutrition) lives in the AI_VAULT Sotus docs and stays deferred here.

**Build approach:** Skateboard (ship the smallest usable Sotus first, then grow it release by release, shippable at every step).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

**First version boundaries:** mobile first web app, English only, sources are YouTube (including Shorts) and recipe web pages. Everyone signed in can view every recipe; only the person who added a recipe can edit it; your collection is recipes you added or saved.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | planned |
| 4 | Design system & UI foundation | Foundation | planned |
| 5 | Sign in | Release 1 | planned |
| 6 | Recipe from a web page link | Release 1 | planned |
| 7 | Recipe from a YouTube link | Release 1 | planned |
| 8 | Recipe page | Release 1 | planned |
| 9 | Shared recipe library | Release 1 | planned |
| 10 | Extraction error tracking | Release 1 | planned |
| 11 | Save to my collection | Release 2 | planned |
| 12 | What should I cook today | Release 2 | planned |
| 13 | Edit my recipe | Release 3 | planned |
| 14 | Search & filter | Release 3 | planned |

## Foundations

### 1. Stack & architecture · in-progress
Decide the web stack, hosting, sign in approach, and AI provider, then scaffold a runnable project that deploys to a public URL.
**Done when:** the stack is recorded in a spec, and the empty scaffold runs locally, builds clean, and is live at a shareable URL.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `src/`, `supabase/`, `scripts/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
  - [x] Gemini YouTube feasibility spike, evidence recorded in spec 0001 `rationale.md` (gates #7, not the scaffold). Ran 2026-09-27, verdict **Fail** on grounding, so #7 owes an `/architect` supersede run.
- [ ] Verify it: `/check verify stack & architecture`

### 2. Coding standards & tooling
Capture conventions from the real scaffold, then install lint, format, and type checks so every later feature follows them.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and type checks run clean.
- [ ] Capture conventions + tooling choices: `/audit`

### 3. Data model · needs a decision
Users, recipes (ingredients, steps, source link, who added it), and each user's saved collection, shaped so later extras (tags, meal plans) fit without a painful migration.
**Done when:** a recipe can be stored with its source and owner, any signed in user can read it, only its owner can change it, and a user can save any recipe to their collection.
- [ ] Design it (spec): `/architect data model`

### 4. Design system & UI foundation · needs a decision
Colors, type, spacing, and base components for a warm, mobile first kitchen feel (the earlier "Sodrus" direction in the Vault is a starting input, not a lock).
**Done when:** `design.md` covers tokens and core components, and base components meet contrast, focus, and keyboard basics at phone width.
- [ ] Design it (spec): `/architect design system & UI foundation`

## Release 1: Link in, recipe out

The smallest usable Sotus: sign in, paste a link, get a clean recipe everyone can see.

### 5. Sign in · needs a decision
Simple sign in so recipes have an owner and the app knows whose collection is whose.
**Done when:** a person can sign up, sign in, and sign out on a phone; signed out visitors are sent to sign in.
- [ ] Design it (spec): `/architect sign in`

### 6. Recipe from a web page link · needs a decision
Paste a recipe page link and get a structured recipe (title, ingredients with amounts, steps, source). Simplest source, so it proves the extraction contract first.
**Done when:** pasting a typical recipe page link produces a saved recipe with ingredients and steps in under a minute, and a non recipe or broken link shows a clear message.
- [ ] Design it (spec): `/architect recipe from a web page link`

### 7. Recipe from a YouTube link · needs a decision
Paste a YouTube video or Short and get the same structured recipe, so the recipe is no longer buried in the video. The headline demo moment.
**Done when:** pasting a YouTube cooking video or Short produces a saved recipe linked to the video; a video with no usable recipe content shows a clear message instead of a made up recipe.
- [ ] Design it (spec): `/architect recipe from a youtube link`

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
- **Lithuanian language** · needs a decision
- **Native mobile app with share sheet capture** · needs a decision
- **Public landing page with SEO**
- **Usage analytics** · needs a decision
- **Privacy and terms page**

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
