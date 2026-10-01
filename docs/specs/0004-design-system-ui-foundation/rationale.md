# 0004. Rationale: design system and UI foundation

The decision record behind [index.md](index.md). `/develop` builds from `index.md`; this file
explains why.

## Context

> ⚠️ Premise note: a design system designed before any real screen exists tends to grow components
> no screen needs, and to guess wrong about the ones it does. This spec limits what #4 builds to
> primitives, feedback states and the shell, which every screen certainly uses, and leaves the
> recipe specific pieces as written blueprints that #8, #9 and #11 build against real data.

Sotus is a mobile first web app used in two moods: browsing and adding recipes at rest, and
glancing at a recipe in a bright kitchen with busy hands. The scaffold still carries the shadcn
`neutral` defaults (grey, Geist), which spec 0001 explicitly hands to feature #4 to replace. Every
Release 1 feature (#5 sign in, #6 and #7 the add flow, #8 the recipe page, #9 the library) will
build UI soon, and without a shared system each one would invent its own colours, spacing and
states.

An earlier direction ("Sodrus") exists as three HTML mockups in `design/`, written in Lithuanian
before the current product model was settled. The engineer asked that it be treated as a reference,
not a lock: keep its principles (premium modern consumer UI, strong typography and hierarchy,
disciplined spacing, restrained visuals, subtle high quality motion, nothing that looks like a
generic AI or Tailwind template), but re-evaluate every screen against the accepted specs, and
prefer a refresh over a restart unless the old direction conflicts with the product.

Since those mockups, the product changed in ways that matter for design. Specs 0002 and 0003 make
recipes canonical and read only, saved automatically once they pass grounding checks, with
ungrounded amounts left empty ("amount not given"). The data model holds no servings, cooking time,
calories or web images; only YouTube recipes have a derived thumbnail. Meal plans, shopping and
nutrition are deferred. Sign in is Google only. The scope fixes English only, WCAG AA, and phone
width as the design target, and the build approach is Skateboard.

The constraints: Tailwind v4 with shadcn/ui `radix-nova` and CSS variables are already installed
(0001); Server Components first, client components only for real interaction (AGENTS.md); no new
dependencies without a reason; one builder, a course demo, Alpha rigor proven with `/check verify`.

## Review of the earlier Sodrus direction

Evidence for the "refresh, not restart" call. Sources: `design/directions.html`,
`design/review-screen.html`, `design/plan-screen.html`, checked against specs 0002 and 0003 and
`docs/scope/scope.md`.

### Kept

| From the old direction | Why it still fits |
|---|---|
| "The food is the hero, not the interface"; a recipe book, not a dashboard | The core job is unchanged: turn a link into a recipe you want to cook |
| Warm, hue biased neutrals (oat `#F4EEE1`, surface `#FBF7EE`, ink `#221E17`, ink 2 `#5C5344`) | Pass AA comfortably (14.35 and 6.54 on the page) and avoid sterile grey |
| Herb green `#3F5230` leading, paprika `#D2803A` as accent | Herb passes 7.38 on oat; paprika fails as text (2.64), so it is kept as a decorative highlight with a darker `#9A5220` for text |
| Bricolage Grotesque display with Hanken Grotesk body | Character without the cream and serif cliché; Hanken has tabular figures for amounts |
| Calm language: no red for "not sure" | Spec 0002 has many `insufficient` outcomes that are not the user's fault; red would read as blame |
| Readable at a glance: big type, big targets, one hand, state not by colour alone | Matches the kitchen use and the WCAG AA rule in AGENTS.md |
| Restrained motion, only for meaningful moments | Matches the engineer's principles and avoids the generic AI look |

### Outdated by the product model

| Old element | Why it no longer applies |
|---|---|
| Review draft screen: confirmed vs "AI guessed ≈ 1 tsp", a clarifying question, Save or Reject | Recipes are saved automatically and are canonical and read only (0003); ungrounded amounts are dropped, not guessed (0002 AC-6). There is no draft to review. Its only survivor is the "amount not given" state |
| Plan screen: week strip, lunch and dinner slots, kcal goal, leftovers | Meal plans and nutrition are deferred in the scope |
| Bottom tabs Recipes, Plan, Shopping, Profile | Plan and Shopping are deferred; the real destinations are Library, My recipes and later Cook today |
| Meta line "2 servings · 35 min · 520 kcal" | No such columns exist in 0003 |
| Photo first cards with photo placeholders | Web recipes have no image column; most cards would show a placeholder |
| Lithuanian copy | The first version is English only |
| Sodrus dark theme | Not wrong, but deferred: v1 ships light only |

### Redesigned from scratch

Home and discovery, the add link flow and its one minute wait, the canonical recipe page with
provenance, the saved collection, navigation, and the empty, loading and error states. None of
these existed in the old mockups in a form that matches today's data, so each is a new blueprint
in `index.md`.

## Options considered

### Option 1: Refresh Sodrus on the shadcn token system

Keep the Sodrus principles, palette family and typefaces, refine them for contrast and restraint,
map them onto the shadcn semantic tokens, build primitives, feedback states and the shell, and
write new blueprints for every screen.

**Pros**:
- Keeps the warm, least generic direction the earlier exploration already chose.
- shadcn components keep working unchanged because only token values and a few additions change.
- Blueprints stop each later feature from inventing its own layout.

**Cons**:
- More work up front than keeping the defaults: a written system, a gallery and restyled components.
- Blueprints may need small corrections when real data arrives.

### Option 2: Keep the shadcn neutral defaults, only swap a primary colour

Change `--primary` to a green, keep Geist and the neutral greys, and let each feature style its own
screen.

**Pros**:
- Almost no work now; the scaffold already runs on it.
- shadcn defaults are well tested for contrast.

**Cons**:
- It is exactly the generic Tailwind template look the engineer wants to avoid.
- No shared states or blueprints, so screens drift apart feature by feature.

### Option 3: Restart with a new direction

Drop Sodrus and design a fresh direction (for example the brighter "Turgus" market look, or
something new).

**Pros**:
- No inherited assumptions from the older product model.
- Turgus would give the highest readability in bright light.

**Cons**:
- Throws away a direction that still fits the product's feeling; the engineer asked for a refresh unless there is a material conflict, and there is none.
- Turgus's bright, clean palette is the most generic of the three explored.

### Option 4: Build the Sodrus mockups as they are

Translate the existing mockups directly into components: photo first cards, the review draft
screen, the plan tab, light and dark themes.

**Pros**:
- The look is already fully drawn; the least design thinking needed.
- Ships a dark theme from the start.

**Cons**:
- Builds screens for flows the product no longer has (draft review, meal plan) and shows data the model does not store.
- Photo first cards would mostly show placeholders.

## Rationale

Option 1 is the only one that satisfies both of the engineer's constraints at once: it keeps the
principles and the non generic character (which rules out Option 2), and it follows the current
product model instead of the old one (which rules out Option 4). A full restart (Option 3) would be
justified only if Sodrus conflicted with the product. The review above found the conflicts lie in
the screens, not in the visual language, so a refresh fixes them at lower cost.

Within Option 1, each sub choice follows the forces in Context. Light only, because the kitchen in
daylight is the hardest reading condition and one theme halves the contrast work for a one builder
demo. Herb leads and paprika stays rare and decorative, because paprika cannot carry text at AA.
Type first cards, because the data has no web images and pretending otherwise would fake content.
Medium crisp shapes with hairlines instead of shadows, because soft pill shapes are the generic
template signature. CSS only motion, because the few moments that need motion are simple
transitions, and a JavaScript animation library would add client code to otherwise server rendered
pages. Bottom tabs with the add form on the home screen, because the core action should take zero
taps and the destinations (Library, My recipes, later Cook today) fit a two to three item bar.

Building only primitives, feedback states and the shell, while writing the recipe specific pieces
as blueprints, answers the premise concern: #4 ships what every screen certainly needs, and the
features that own real data build the rest against a fixed plan. The development only `/dev/ui`
gallery gives `/check verify` one place to prove contrast, focus and keyboard behaviour for every
state without adding a public page.

Smaller calls made while writing the spec, each with its runner up:
- **Hex in `globals.css`**, not OKLCH: the values then match `docs/design.md` one to one and are easy for a junior to read. Runner up: OKLCH, as the shadcn defaults use.
- **Navigation renders only with two or more real destinations**: #9 ships before #11, and a single item bar or a link to a missing route would be wrong. Runner up: a placeholder My recipes page, rejected as a fake feature.
- **`accent` is the hover surface** instead of a new `secondary-hover` token: nova components already hover to `accent` or `muted`, so giving `accent` a distinct value fixes the invisible hover with no new name. Runner up: a dedicated `secondary-hover` token.
- **Restyle nova `Alert` and `Empty`** instead of custom `InlineMessage`, `NoticeBanner` and `EmptyState` components: fewer primitives, and the shadcn names stay recognisable. Runner up: thin wrappers with Sotus names.
- **`@utility type-*`** instead of `--text-*` theme tokens: a utility can carry the font family too, so one class sets the whole style. Runner up: `--text-*` tokens plus a separate `font-heading` class.

## Review reconciliation (2026-10-01)

The first draft was checked by two independent reviews (a Codex review and a Sonnet cross check)
and reconciled into one set of contracts by the engineer's direction. The resulting changes are
in `index.md`: a stable shell with page owned back links and titles, one client `NavLinks`, short
pending labels with a separate polite status region, tone separated from announcement, a single
global focus outline, generic typography utilities, explicit nova deviations with a `check:ui`
guard, reduced motion that removes rather than shortens motion, conditional bottom clearance, an
explicit token list with an `accent` hover surface, a narrowed meaning for red, the removal of
`NoticeBanner`, and illustrative only blueprints with 0003 as the authority.

Findings not adopted, and why:
- **`aria-disabled` instead of native `disabled` on pending buttons.** Native semantics are kept, as directed. The concrete risk (some browsers drop focus from a button that becomes disabled) is handled by the failure contract instead: focus moves to the form's input after any failed submit, and success redirects.
- **A custom `Field` wrapper with `label`, `hint` and `error` props.** The nova `Field` parts already cover the layout; a wrapper would be one more primitive. The form wires ids with `useId()`.
- **Keeping the button width stable while pending.** The short `pendingLabel` makes the width change small, and buttons use `min-h-11` with wrapping allowed; reserving width for the longer label adds markup for little gain.
- **`aria-busy` on the pending button.** It has no reliable effect on a button; the status region carries the progress.
- **An `sm` button size inside an enlarged hit area.** Nothing in v1 needs a small button, so the size is removed instead.
- **Setting `interactiveWidget` in the viewport.** The browser default already keeps the fixed bar behind the software keyboard; the behaviour is verified instead of configured.
- **A `--text-*` theme scale.** Replaced by `@utility type-*`, which sets the family as well (see the smaller calls above).
- **Moving the 0002 pending text change into this spec.** 0004 sets the pattern; 0002's own AC-10 and *Pending UI* were updated in place on 2026-10-01 to follow it.

## Post build review update (2026-10-01)

The `/check review` of the build branch found two gaps in this spec, not only in the code.

**Field error announcement (AC-11).** The contract read the error through the focused input's
`aria-describedby`. When the user presses Enter while typing, focus is already in the input, so
moving it fires no event, and screen readers generally do not read a changed `aria-describedby` on
the focused element. The error was silent in the most common case. Options weighed:
- **Status region only when the input already has focus (chosen).** Reuses the stable polite
  region AC-12 already mounts, adds no component, and keeps one channel per error. Clearing the
  region and setting it on the next frame makes a repeated error read again.
- **Always summarise the error in the status region.** Simpler, but after a button click focus
  moves and the error is read twice.
- **Blur and refocus the input.** No new text, but screen reader behaviour varies and the field
  can flicker. Rejected.

**Reduced motion wording (AC-14).** The spec said "transforms are removed", and the build read it as
a global `transform: none !important`. That rule overrides the inline transforms Radix Popper uses
to position overlays, and misses Tailwind v4 `scale-*` (a separate property) anyway. The accepted
implementation removes motion transforms through the `motion-safe:` variant and leaves layout
transforms alone. AC-14 and *Motion* now say that.
