# 0004. Design system and UI foundation: a refreshed Sodrus on shadcn tokens

**Date**: 2026-10-01
**Status**: Accepted

## Summary

Sotus gets one visual system before any real screen is built: a refreshed version of the earlier
"Sodrus" direction (warm oat neutrals, herb green, a rare paprika highlight, Bricolage Grotesque
titles with Hanken Grotesk text), written into `docs/design.md` and wired into the shadcn/ui
tokens in `globals.css`. This feature builds three things only: the base components (buttons,
fields, messages, skeletons, empty states), the feedback and focus rules that make them accessible,
and the app shell (header, navigation, main area). Recipe specific pieces (recipe card, provenance
line, ingredient row, save toggle) stay with features #8, #9 and #11; the screen sketches in this
spec only illustrate how the parts fit, and each owning feature's spec decides its final screen.

## Requirements

**User stories**:
- As a cook on my phone, I want every screen to look and behave the same way so that Sotus feels like one calm recipe book, not a set of pages.
- As a cook in a bright kitchen, I want large, high contrast text and big tap targets so that I can read and tap with one hand.
- As a keyboard or screen reader user, I want every control reachable, labelled, visibly focused and announced at the right moment so that I can use Sotus without a mouse or a screen.
- As the builder of features #5 to #12, I want tokens, components and accessibility contracts already settled so that I build screens instead of inventing a look each time.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

*Written system*
- **AC-1**: `docs/design.md` exists and covers: the principles kept from the old direction and what changed (kept, outdated, redesigned); every colour token with hex, role and measured contrast; the typography utilities; spacing, widths, radius and elevation; motion; icons; the writing voice; each component's contract from this spec (anatomy, variants, states, announcement and focus behaviour); the shell contract; the *After `shadcn add`* checklist; and the illustrative screen sketches, marked as illustrative with the authority rule from *Blueprint authority*. It names `design/*.html` as superseded references that nobody builds from.

*Tokens and contrast*
- **AC-2**: `src/app/globals.css` defines exactly the colour tokens in *Colour tokens* as hex values in `:root`, each exposed as `--color-<name>` in `@theme inline`. The `sidebar-*` and `chart-*` tokens and the neutral `.dark` block are removed; `@custom-variant dark` stays for a later dark theme; `html` sets `color-scheme: light`; `--radius` is `0.75rem`.
- **AC-3**: Every pair in the *Contrast table* measures at or above its listed limit (4.5:1 for text, 3:1 for input borders and the focus outline). `highlight` is decorative only: it never carries meaning alone and the only text on it is `highlight-foreground`. `highlight-ink` text is never placed on `accent`. No opacity modifier (`/50`, `/20`, …) is applied to `input`, `ring`, `destructive` or any text colour token anywhere in `src/`.
- **AC-4**: `destructive` red has exactly two uses: a field validation error (the user must change what they typed: red input border plus red error text) and a destructive action (none in v1). An extraction or system outcome ("we couldn't read that link") never uses red; it uses the `problem` tone.

*Typography*
- **AC-5**: `src/app/layout.tsx` loads Hanken Grotesk as `--font-hanken` and Bricolage Grotesque (with `axes: ["opsz"]`, no `weight` option) as `--font-bricolage` through `next/font/google`, latin subset, `display: "swap"`, `fallback: ["system-ui", "sans-serif"]`, both `.variable` classes on `<html>`. `@theme inline` maps `--font-sans: var(--font-hanken)` and `--font-heading: var(--font-bricolage)`; `--font-mono` and the Geist fonts are gone. On `/dev/ui`, with the web fonts blocked the page stays readable with no overlap, and a `tabular-nums` sample shows equal width digits in Hanken Grotesk (if it does not, `docs/design.md` records the fallback: amounts right aligned with proportional digits).
- **AC-6**: `globals.css` defines the typography utilities `type-display`, `type-heading`, `type-title`, `type-body-lg`, `type-body`, `type-label` and `type-caption` with `@utility`, each setting family, size, line height, weight and tracking per *Typography*. `body` uses `type-body`. No base rule ties a heading element to a style: the heading level (`h1` to `h3`) follows the document outline and the utility follows the visual need, set independently on each element.

*Focus, keyboard and mobile*
- **AC-7**: A single global rule `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` draws every focus indicator. The generated nova classes `focus-visible:ring-*`, `focus-visible:border-ring`, `aria-invalid:ring-*` and the base rule `outline-ring/50` are removed. When the bottom navigation renders, `html` gets `scroll-padding-bottom` equal to its height plus the safe area, so a control focused by Tab is never hidden behind the bar.
- **AC-8**: "Skip to content" is the first focusable element, visible only on focus, and moves focus to `<main id="main" tabIndex={-1}>`. Every control on `/dev/ui` is reachable and usable with Tab, Shift+Tab, Enter and Space, in visual order, with no trap. Navigation links sit inside one visible `<nav aria-label="Main">` and the current one carries `aria-current="page"`. On client navigation Sotus adds no focus code of its own: Next.js moves focus to the changed segment and its route announcer reads `document.title`, so every page sets a unique `title` in its metadata.
- **AC-9**: Standalone controls (buttons, inputs, nav links, the skip link) are at least 44px tall and at least 44px wide (`min-h-11`, never a fixed height, so text can wrap). Inline text links inside running text are exempt. Inputs use 16px text at every width. The layout works with no sideways scroll at 320px wide, at 200% text size, in phone landscape, and with the software keyboard open (the focused field stays visible). With the bottom navigation present, the last focusable control on the page can be scrolled fully above the bar.

*Components*
- **AC-10**: `Button` keeps the nova variant names (`default` is the herb primary, `secondary`, `outline`, `ghost`, `destructive`, `link`) and offers the sizes `default` (`min-h-11 px-4`) and `icon` (`size-11`); `xs`, `sm`, `lg`, `icon-xs`, `icon-sm` and `icon-lg` are removed. Its props are a union: with `asChild` the `pending` and `pendingLabel` props do not type check. With `pending`, it uses the native `disabled` attribute, shows `Spinner` (hidden from assistive technology) plus `pendingLabel`, a short label of at most about 12 characters (for example "Reading…"), and a second activation does nothing.
- **AC-11**: Fields use the nova `Field` parts (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`) with a visible label; a placeholder is never the label. The input's `aria-describedby` lists the description id and, when present, the error id. A field validation error sets `aria-invalid="true"` on the input and `data-invalid` on `Field`, shows `FieldError` (its built in `role="alert"` removed), and keeps the typed value. After any failed submit, focus moves to the first invalid input, or to the main input of the form when the failure is not tied to a field, so the error is read through the focused field. When that input already has focus (Enter pressed while typing, or a repeat submit), moving focus fires no event and nothing would be read, so the form instead writes the error text into its stable `role="status"` region (AC-12): it clears the region, then sets the text on the next frame, so the same error submitted twice is read twice. When focus did move, the region stays empty. Each field error is announced through exactly one channel, never both.
- **AC-12**: Feedback separates look from announcement. `Alert` has a visual `tone` (`info`: muted surface; `problem`: card surface, paprika side bar, `highlight-ink` icon, ink text) and an independent `announce` prop: `"off"` (default, no role, static content), `"polite"` (`role="status"`), `"assertive"` (`role="alert"`, only for a failure newly returned by an action). Async progress uses one stable polite status region: a `role="status"` element mounted with the form before the work starts, whose text changes when work begins. `Skeleton` and `Spinner` carry `aria-hidden="true"` and no role. `Empty` (nova) shows a media icon, a title, a description and at most one action.

*Shell*
- **AC-13**: `AppShell` renders `SkipLink`, `AppHeader`, `<main id="main" tabIndex={-1}>` and `BottomNav`. `AppHeader` is stable across pages: the wordmark linking to `/`, the inline navigation from `md` up, and an `actions` slot (#5 fills it); it has no page title or back link, because page specific back links, titles and actions are rendered by the page inside `main`. One client component, `NavLinks`, uses `usePathname()` for both the inline and the bottom placement. Navigation renders only destinations whose routes exist, listed in `nav-items.ts`, and renders nothing in either placement when fewer than two exist. A route that matches no item (such as a recipe page) shows no active item. `main` gets bottom clearance for the bar plus `env(safe-area-inset-bottom)` only when the bottom navigation renders.

*Motion*
- **AC-14**: The allowed motion is: colour transitions on hover and press (150ms, ease out), a press transform (`scale-[0.98]` on buttons), the `Skeleton` shimmer loop, the `Spinner` rotation, and optional entry animation for an `Alert` (200ms fade). Under `prefers-reduced-motion: reduce` all motion is removed (not shortened): a global rule sets `animation: none` and `transition: none` on every element, and every motion transform (the button press) is written with the `motion-safe:` variant, so it never applies. The global rule never touches `transform`, `translate`, `scale` or `rotate`, because positioned overlays (Radix Popper menus, popovers, selects, tooltips) place themselves with an inline transform that must keep working. the skeleton is a static `muted` block, the spinner is a still icon, and text progress (the status region and `pendingLabel`) still shows. No JavaScript animation library is installed.

*Guards and proof*
- **AC-15**: `pnpm check:ui` (a small script, no new dependency) fails when any file in `src/components/` or `src/app/` contains a banned class pattern from *After `shadcn add`*; lint-staged runs it on staged `.tsx` files, so a newly generated shadcn component cannot silently bring back incompatible styles.
- **AC-16**: `/dev/ui` renders every colour token as a named swatch, every typography utility, every component in every state (default, focus, pending, disabled, field error, both tones with each announce mode, status region, empty, skeleton, tabular figures sample) and both navigation placements, at phone width. Its layout calls `notFound()` when `NODE_ENV` is not `development`, and its metadata sets `robots: { index: false }`.

## Decision

**Chosen option**: Option 1: Refresh Sodrus on the shadcn token system

Lock a refreshed Sodrus direction (light only, herb led, type first, medium crisp shapes, CSS only
motion) into `docs/design.md`, map it onto the shadcn semantic tokens, and build the primitives,
feedback states and app shell with explicit accessibility contracts. Recipe specific patterns and
final screens stay with their owning features.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vercel-composition-patterns` (`vercel-labs/agent-skills`, `.claude/skills/vercel-composition-patterns/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`)

## Rationale

Reasoning, options, the old mockup review and the review reconciliation: see [rationale.md](rationale.md).

## Feature design

### Principles (kept from Sodrus, carried into `docs/design.md`)

1. **The food is the hero, not the interface.** With few photos, the recipe title and typography carry the page.
2. **Warm and appetizing, never sterile.** Hue biased neutrals (oat, ink brown), herb green leading, grotesque type; no cream and serif cliché.
3. **Readable at a glance.** Big type, 44px targets, one hand reach, tabular figures, state shown by shape and words, never colour alone.
4. **Calm language.** A failure is explained, never shouted.
5. **Restraint.** One accent leads; motion only where it explains something; no decorative gradients, glows or glass.

### Colour tokens (light only)

Hex values are the source of truth, written as hex in `globals.css`.

| Token | Hex | Role | Kind |
|---|---|---|---|
| `background` | `#F4EEE1` | Page (oat) | shadcn, value replaced |
| `foreground` | `#221E17` | Body text (ink) | shadcn, value replaced |
| `card`, `popover` | `#FBF7EE` | Raised surfaces | shadcn, value replaced |
| `card-foreground`, `popover-foreground` | `#221E17` | Text on raised surfaces | shadcn, value replaced |
| `primary` | `#3F5230` | Herb: `default` buttons, active nav item, links | shadcn, value replaced |
| `primary-foreground` | `#FBF7EE` | Text on `primary` | shadcn, value replaced |
| `secondary`, `muted` | `#EFE7D6` | Quiet fills: secondary buttons, skeleton base, `info` tone | shadcn, value replaced |
| `secondary-foreground` | `#221E17` | Text on quiet fills | shadcn, value replaced |
| `muted-foreground` | `#5C5344` | Meta text, descriptions, inactive nav items | shadcn, value replaced |
| `accent` | `#E6DCC8` | **The hover surface**: hover and pressed state for `secondary`, `outline`, `ghost` and menu rows; visibly darker than `secondary`, `muted` and `background` | shadcn, value replaced |
| `accent-foreground` | `#221E17` | Text on `accent` | shadcn, value replaced |
| `destructive` | `#A63A24` | Field validation errors and destructive actions only (AC-4) | shadcn, value replaced |
| `border` | `#E2D8C4` | Decorative hairlines only | shadcn, value replaced |
| `input` | `#8F826A` | Input borders (3:1) | shadcn, value replaced |
| `ring` | `#3F5230` | Focus outline | shadcn, value replaced |
| `primary-hover` | `#2E3D22` | Hover and pressed `default` button (replaces nova `hover:bg-primary/80`) | **added** |
| `destructive-foreground` | `#FBF7EE` | Text on a solid `destructive` fill (replaces nova `text-white`) | **added** |
| `highlight` | `#D2803A` | Paprika, decorative fill only: `problem` side bar, shimmer tint | **added** |
| `highlight-foreground` | `#221E17` | The only text allowed on `highlight` | **added** |
| `highlight-ink` | `#9A5220` | Paprika as text or icon colour (`problem` icon) | **added** |

### Contrast table

| Pair | Ratio | Limit |
|---|---|---|
| `foreground` on `background` / `card` / `muted` / `accent` | 14.35 / 15.51 / 13.48 / 12.19 | 4.5 |
| `muted-foreground` on `background` / `card` / `muted` / `accent` | 6.54 / 7.08 / 6.15 / 5.56 | 4.5 |
| `primary-foreground` on `primary` / `primary-hover` | 7.98 / 10.87 | 4.5 |
| `primary` as text on `background` / `card` / `muted` / `accent` | 7.38 / 7.98 / 6.94 / 6.27 | 4.5 |
| `highlight-foreground` on `highlight` | 5.44 | 4.5 |
| `highlight-ink` on `background` / `card` / `muted` | 5.04 / 5.45 / 4.74 | 4.5 (not allowed on `accent`: 4.29) |
| `destructive` text on `background` / `card` / `muted` | 5.59 / 6.04 / 5.25 | 4.5 |
| `destructive-foreground` on `destructive` | 6.04 | 4.5 |
| `input` border on `card` / `background` / `muted` | 3.53 / 3.26 / 3.07 | 3 |
| `ring` outline on `background` / `card` / `muted` | 7.38 / 7.98 / 6.94 | 3 |
| `highlight` fill on `card` (decorative, never alone) | 2.85 | none |
| `border` hairline on `card` (decorative; cards are not controls) | 1.32 | none |

Disabled controls use `opacity-50` and `cursor-not-allowed` (exempt from contrast under WCAG). `viewport.themeColor` is `#F4EEE1`. Dark mode is out of scope; the token names are final, so a later `.dark` block only adds values.

### Typography

Defined with `@utility` in `globals.css`. Names are foundation roles, not recipe parts.

| Utility | Family | Size / line height | Weight | Tracking | Typical use |
|---|---|---|---|---|---|
| `type-display` | heading (Bricolage) | 2rem / 2.25rem | 600 | −0.02em | The main title of a detail page |
| `type-heading` | heading | 1.5rem / 1.875rem | 600 | −0.01em | Screen titles |
| `type-title` | heading | 1.25rem / 1.625rem | 600 | −0.005em | Section titles, the wordmark |
| `type-body-lg` | sans (Hanken) | 1.0625rem / 1.75rem | 400 | 0 | Long reading text meant for arm's length |
| `type-body` | sans | 1rem / 1.5rem | 400 | 0 | Default text, input text |
| `type-label` | sans | 0.9375rem / 1.25rem | 500 | 0 | Button text, field labels |
| `type-caption` | sans | 0.875rem / 1.25rem | 400 | 0 | Meta lines, descriptions, nav labels |

Rules: sentence case everywhere, no uppercase eyebrows; `text-balance` on headings, `text-pretty` on paragraphs; amounts and counts use `tabular-nums`. Weight can be raised per element (`font-semibold` on a `type-body-lg` card title) without a new utility. The wordmark is `type-title` with the text "Sotus".

### Space, layout, shape, elevation

- **Spacing steps**: 4, 8, 12, 16, 24, 32, 48px (Tailwind `1, 2, 3, 4, 6, 8, 12`).
- **Gutters**: 16px on phones, 24px from `md` (768px).
- **Widths** (`PageContainer width`): `reading` = `max-w-2xl` (672px), `wide` = `max-w-5xl` (1024px). `AppHeader`'s inner row uses `wide`.
- **Radius**: `--radius: 0.75rem`. Cards `rounded-lg` (12px), controls `rounded-md` (about 10px), badges `rounded-full`.
- **Elevation**: cards use a hairline `border` and no shadow; only menus and popovers take `shadow-sm`; the bottom bar is a solid `card` surface with a top hairline, no blur.

### Motion

| Moment | Effect | Timing | Under reduced motion |
|---|---|---|---|
| Hover and press | Background to `accent` or `primary-hover` | 150ms ease out | No transition, instant colour change |
| Button press | `motion-safe:active:scale-[0.98]` (replaces nova `active:translate-y-px`) | 150ms | No transform |
| Skeleton | Shimmer: `shimmer` keyframe in `globals.css`, gradient `muted` → `color-mix(in oklab, var(--highlight) 15%, var(--muted))` → `muted`, `background-size: 200% 100%`, 1.6s linear infinite | loop | `animation: none`, static `muted` |
| Spinner | Rotation (`animate-spin`) | loop | Still icon; `pendingLabel` carries the meaning |
| Alert entry (optional) | `motion-safe:animate-in fade-in` | 200ms | None |

Implementation: transforms and entry animations use the `motion-safe:` variant; a global `@media (prefers-reduced-motion: reduce)` rule sets `animation: none !important; transition: none !important` on every element and pseudo element. That rule must not reset `transform` (or `translate`, `scale`, `rotate`): an `!important` stylesheet rule beats inline styles, so it would pin every Radix Popper overlay to the top left corner. Transforms that are layout, not motion, are untouched by reduced motion.

### Icons and voice

- **Icons**: lucide only, 20px in controls, 22px in the bottom bar, `strokeWidth={1.75}`, decorative icons `aria-hidden`. No brand logos as icons. Active nav items use stroke 2.25 instead of a fill (lucide icons are outlines).
- **Voice**: plain, calm, second person, sentence case, no exclamation marks, no "Oops". Say what happened and what to do next. Feature specs own their copy (extraction messages live in 0002 and #6).

### Components built by #4

nova = what `shadcn add` generates for the `radix-nova` style today. Every generated file is then edited per this table and the *After `shadcn add`* checklist.

| Component | File | Kind | Contract (deviation from nova) |
|---|---|---|---|
| `Button` | `ui/button.tsx` | shadcn, edited | Keeps variant names. `default`: `bg-primary hover:bg-primary-hover`. `secondary`: `hover:bg-accent` (replaces the `color-mix` hover). `outline`: `border-input bg-card hover:bg-accent`. `ghost`: `hover:bg-accent`. `destructive`: solid `bg-destructive text-destructive-foreground` (replaces the 10% tint). Sizes `default` `min-h-11 px-4 type-label` and `icon` `size-11`; the other six sizes are deleted. `whitespace-nowrap` removed so text can wrap. Props union: `{ asChild?: false; pending?: boolean; pendingLabel?: string }` or `{ asChild: true }`. Pending per AC-10 |
| `Spinner` | `ui/spinner.tsx` | shadcn, edited | nova's `role="status"` and `aria-label="Loading"` replaced by `aria-hidden="true"`; lucide `Loader2Icon`, size 20 |
| `Input` | `ui/input.tsx` | shadcn, edited | `h-8` → `min-h-11 px-3`; `md:text-sm` removed (16px everywhere); `bg-card`; disabled `bg-input/50` removed |
| `Label` | `ui/label.tsx` | shadcn, edited | `type-label` |
| `Field` parts | `ui/field.tsx` (+ `separator.tsx`) | shadcn, edited | Used as is for layout; `FieldError` loses `role="alert"` (AC-11); `FieldDescription` uses `type-caption text-muted-foreground`. Id wiring is the form's job: `useId()` in the form component, ids passed to `FieldDescription`, `FieldError` and the input's `aria-describedby` |
| `Alert` | `ui/alert.tsx` | shadcn, edited | Variants become `tone`: `info` and `problem` (nova `default` and `destructive` removed). Hardcoded `role="alert"` replaced by `announce` (`off` / `polite` / `assertive`, AC-12). `px-4 py-3`, `type-body` description |
| `Badge` | `ui/badge.tsx` | shadcn, edited | Keeps nova variants; `dark:` and `/80`, `/10` opacity hovers removed; `rounded-full` |
| `Card` | `ui/card.tsx` | shadcn, edited | Hairline border, no shadow, `rounded-lg`, `bg-card` |
| `Skeleton` | `ui/skeleton.tsx` | shadcn, edited | `animate-pulse` → shimmer; `aria-hidden="true"` |
| `Empty` parts | `ui/empty.tsx` | shadcn, edited | Title `type-title`, description `type-caption`; at most one action in `EmptyContent` |
| `SkipLink` | `shell/skip-link.tsx` | Server | `sr-only focus:not-sr-only`, `min-h-11`, targets `#main` |
| `AppHeader` | `shell/app-header.tsx` | Server | Props: `actions?: ReactNode`. Wordmark link, `NavLinks placement="inline"` from `md`. No page title or back link |
| `NavLinks` | `shell/nav-links.tsx` | **Client** (`usePathname`) | Props: `items`, `placement: "inline" \| "bottom"`. Renders `<nav aria-label="Main">` with `next/link` links, icon plus text label, `aria-current="page"` on the match; renders `null` when `items.length < 2` |
| `BottomNav` | `shell/bottom-nav.tsx` | Server | Fixed bottom bar below `md`, `h-16` plus `pb-[env(safe-area-inset-bottom)]`, `data-bottom-nav`, holds `NavLinks placement="bottom"`; renders `null` when `items.length < 2` |
| `AppShell` | `shell/app-shell.tsx` | Server | Props: `actions?`, `children`. Composes SkipLink, AppHeader, `main`, BottomNav; adds `main` bottom clearance only when `navItems.length >= 2` |
| `PageContainer` | `shell/page-container.tsx` | Server | Props: `width: "reading" \| "wide"`, `children`. Width and gutters only; it does not render `main` |
| `navItems` | `shell/nav-items.ts` | data | `readonly { href, label, icon, match: "exact" \| "prefix" }[]`. Ships with Library (`/`, exact) only; #11 adds My recipes, #12 adds Cook today, each when its route exists |

`NavLinks` is the only client component in the shell. Focus outline and reduced motion live in `globals.css`, not in components.

### After `shadcn add` (checklist and banned patterns)

Every later `shadcn add` repeats these edits, and `pnpm check:ui` (`scripts/check-ui-classes.mjs`) enforces the patterns:

| Banned pattern | Why | Replace with |
|---|---|---|
| `focus-visible:ring-`, `focus-visible:border-ring`, `aria-invalid:ring-`, `outline-ring/` | Semi transparent focus ring breaks AC-7 | Nothing; the global outline covers it |
| `outline-none`, `outline-hidden`, `outline-0`, alone or with a `focus:` or `focus-visible:` prefix | Removes the global focus outline, breaks AC-7 | Nothing; keep the global outline. One allowlisted exception, below |
| `dark:` | No dark theme yet; untested colours | Nothing |
| `text-white`, `bg-black`, `bg-white`, Tailwind palette colours (`red-`, `green-`, …), `bg-[#`, `text-[#` | Raw colours bypass tokens | Semantic tokens |
| Opacity on `input`, `ring`, `destructive`, `foreground`, `muted-foreground` (`input/50`, `destructive/10`, …) | Invalidates the contrast table | Solid tokens; `accent` for hover |
| `h-6`, `h-7`, `h-8`, `h-9`, `size-6` to `size-9` on interactive elements | Below 44px | `min-h-11`, `size-11` |
| `active:translate-y-px`, unprefixed `animate-` on loops | Motion outside AC-14 | `motion-safe:` variants |

Allowlist: the script accepts exactly one line, `"flex-1 focus-visible:outline-0",` in `src/components/shell/app-shell.tsx`, the `<main id="main" tabIndex={-1}>` that only the skip link focuses (an outline around the whole page would be noise). It matches by file and exact line text, so a reformat of that line, or the same class anywhere else, fails the guard. Add an entry only for an element that is never a control.

The script scans everything, the gallery included; swatches use CSS variables (`style={{ background: "var(--primary)" }}`), not banned classes.

### Shell contract

```
<body>
  AppShell (Server, mounted by the signed in layout of the owning feature, first #9)
    SkipLink                  first focusable, targets #main
    AppHeader                 stable: wordmark → "/", NavLinks inline (md and up), actions slot (#5)
    <main id="main" tabIndex={-1}>
      page content            page owns its back link, title (h1) and page actions
    </main>
    BottomNav                 below md, fixed, only with 2+ destinations, safe area padded
```

- Destinations: only routes that exist; the nav renders nothing with fewer than two.
- Active item: `exact` match for `/`, `prefix` for the rest; a route matching nothing (recipe page) has no active item, by design.
- Clearance: `main` padding bottom `calc(4rem + env(safe-area-inset-bottom))` and `html` `scroll-padding-bottom` of the same amount, both below `md` and only when `BottomNav` renders (CSS: `:root:has([data-bottom-nav])`).
- Viewport: `export const viewport = { themeColor: "#F4EEE1", viewportFit: "cover" }`; no `interactiveWidget` override (the browser default keeps the bar behind the software keyboard).
- Focus on navigation: none added by Sotus; Next.js focuses the new segment and announces the page title.

### Pending, loading and feedback contract

| Situation | Visual | Announcement | Focus |
|---|---|---|---|
| Action running (for example the add form, about a minute) | Button: `Spinner` + short `pendingLabel` ("Reading…"), native `disabled`. Optional `Skeleton` preview below, `aria-hidden` | One stable `role="status"` region, mounted with the form, empty when idle; on start its text becomes the full progress message the owning feature defines | Unchanged by Sotus |
| Field validation error returned | Red input border, `FieldError` text | Read through the input's `aria-describedby` when focus moves to it. If the input already had focus, the error text goes into the form's status region instead (cleared, then set on the next frame). Never both | Moves to the first invalid input (no change if it is already there) |
| Extraction or system failure returned | `Alert tone="problem"`, inserted under the form | `announce="assertive"` (`role="alert"`), once, when inserted | Moves to the form's main input (not described by the alert, so it is read once) |
| Success | Owning feature redirects | Next.js route announcer reads the new title | Next.js moves it to the new segment |
| Static information present on page load (for example a notice from a query parameter) | `Alert tone="info"` | `announce="off"`, read in normal reading order | Unchanged |
| Route loading | `loading.tsx` with `Skeleton` blocks, `aria-hidden` | A visually hidden `role="status"` text "Loading" in the same file | Unchanged |
| Empty list | `Empty` with one action | None | Unchanged |

### Blueprint authority

The screen sketches below and in `docs/design.md` are **illustrative only**. They show how the
foundation parts compose; they are not data or interaction contracts. The owning feature's spec
defines each screen's final data, copy and behaviour, and [0003](../0003-data-model/index.md) is
authoritative for canonical recipe semantics: `added_by` is attribution only, collection
membership comes from `saved_recipes`, canonical recipes are not user editable, and any personal
customization is a future private layer. Pagination and counts are left to the owning features.

- **Home and library (#9, add form from #6 and #7)**: `AppShell` → a `card` add form (label, input, description, `default` button, status region) → screen `h1` → recipe list, one column on phones, two from `md` → `Empty` when there is nothing yet.
- **Recipe card (#9, reused by #11)**: type first; the whole card one link; a title, a source line in `type-caption`; a YouTube thumbnail only when the data has one, nothing faked for web.
- **Recipe page (#8)**: inside `main`, the page renders its own back link to the library, then the title (`h1`, `type-display`), a provenance line, the save control (#11), ingredients, steps, and a source section with the link to the original.
- **My recipes (#11)**: the same card list for the user's collection; `Empty` pointing back to the library.
- **Sign in (#5)**: outside `AppShell`; a centred reading column with the wordmark, one line of purpose and the Google button.
- **Errors**: a route `error.tsx` shows `Alert tone="problem" announce="assertive"` with a `secondary` "Try again" button that receives focus.

### Data model sketch

No schema change. #4 adds no table, column or migration.

### State transitions

- `Button`: `idle` → `pending` (the caller sets `pending`) → `idle`. While `pending`, activation is ignored.
- Status region: `empty` → `progress message` (work starts) → `empty` (work ends; the result is a redirect, a field error or a problem alert).
- Status region on a field error: `empty` → `field error text` only when the invalid input already had focus; it is cleared at the start of the next submit.

### API surface

No endpoints, Server Actions or RPCs. The component contracts above are the interface. The only new route:

| Route | Method | Inputs | Output | Auth | Errors |
|---|---|---|---|---|---|
| `/dev/ui` | GET | none | Gallery page, `noindex` | none (development only) | `notFound()` (404) when `NODE_ENV` is not `development` |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| `NavLinks` | Destinations, labels, icons, match rule | `navItems` (`items` prop; the gallery passes a fixture) |
| | Active item | `usePathname()` compared by `match` |
| | Whether it renders | `items.length >= 2` |
| `AppShell` | Bottom clearance | `navItems.length >= 2` (same rule as `BottomNav`) |
| `AppHeader` | Right side actions | `actions` prop (#5) |
| `Button` | Pending state and label | `pending`, `pendingLabel` props from the calling form |
| Status region | Progress text | The owning feature's spec (for #7, 0002's pending message) |
| | Field error text (input already focused) | The same string `FieldError` shows; whether to use it is `document.activeElement === input` at the moment the error is set |
| `Alert` | Role | `announce` prop; default `off` |
| Field ids | Description and error ids | `useId()` in the form component |
| Fonts | `--font-hanken`, `--font-bricolage` | `next/font/google` in `src/app/layout.tsx` |
| Page titles | `document.title` for the route announcer | Each route's `metadata.title` (owning feature) |
| `/dev/ui` | Swatches | CSS variables by token name; ratios live in `docs/design.md` |
| | Production guard | `process.env.NODE_ENV` in `src/app/dev/ui/layout.tsx` |
| | Nav demo | Fixture `[{ href: "/dev/ui", label: "Gallery" }, { href: "/", label: "Home" }]`, both real routes |

### Key invariants

- A colour exists only as a token in `globals.css` and `docs/design.md`; components use semantic utilities.
- Red means "change what you typed" or "this destroys something", never "we couldn't".
- Visual tone and announcement are set independently; nothing becomes a live region unless the moment needs it.
- Every announced moment speaks through exactly one channel: focus plus `aria-describedby`, the status region, or an assertive alert. Never two at once.
- One `h1` per page; heading levels never skip; visual style never decides the level.
- The shell is stable; page specific controls live in the page.
- Navigation shows only routes that exist.
- Nothing shows data the model does not have.

### Security model

No user data, secrets or new permissions. `/dev/ui` returns 404 outside `next dev` and is `noindex`. When #5 adds the signed out redirect to `proxy.ts`, `/dev/ui` may redirect signed out visitors in development; that is acceptable.

### Configuration required

None.

### Critical test scenarios

- Gallery renders: `/dev/ui` at 390px shows every token, utility, component state and both nav placements in Sotus colours and fonts, verifies **AC-1**, **AC-2**, **AC-6**, **AC-16**
- Contrast: measure each pair in the contrast table with the browser contrast checker or axe; none fall below the limit, verifies **AC-3**
- Red rule: the field error demo is red; the extraction failure demo is the paprika `problem` tone with no red, verifies **AC-4**
- Fonts: block font requests in devtools; the page stays readable; the `tabular-nums` sample digits align, verifies **AC-5**
- Focus: Tab through `/dev/ui`; every control shows the solid herb outline with its offset gap, including on `default` buttons; with the fixture nav at 390px, Tab to the last control and it stays above the bar, verifies **AC-7**, **AC-9**
- Keyboard: the skip link comes first and lands on `main`; no trap; the nav demo marks the current route, verifies **AC-8**
- Phone fit: 320px, 200% text size, landscape and the software keyboard on a real phone or emulator; no sideways scroll, focused field visible, controls at least 44px, verifies **AC-9**
- Pending: the demo button shows "Reading…" with the spinner, ignores a second click, and the status region (already mounted) announces the long message once; `asChild` with `pending` fails the type check, verifies **AC-10**, **AC-12**
- Failure recovery: with a screen reader on, submit a bad link with the button, then again with Enter inside the field, then press Enter a second time; each time the error is read exactly once (the first through focus, the others through the status region); the demo extraction failure is announced once as an alert and focus moves to the input, verifies **AC-11**, **AC-12**
- Static info: a `tone="info"` alert present on load is not announced on its own, verifies **AC-12**
- Shell rule: with one destination neither nav placement renders and `main` has no bottom padding; with two both appear in their breakpoints, verifies **AC-13**
- Reduced motion: with the OS setting on, the skeleton is static, the spinner is still, nothing transitions, and the text progress remains, verifies **AC-14**
- Guard: adding a fresh nova component without the edits makes `pnpm check:ui` fail and blocks the commit, verifies **AC-15**
- Production guard: `pnpm build && pnpm start`, then `/dev/ui` returns 404, verifies **AC-16**

## Build plan

Skateboard: the first slice is the smallest whole that changes how Sotus looks everywhere (the
written system plus tokens, fonts and focus), then each slice adds a layer later features can use
right away.

1. Write `docs/design.md` from this spec, marking `design/*.html` as superseded, satisfies **AC-1**
2. Rewrite the tokens and base styles in `src/app/globals.css`: the token list, `@theme inline` mappings, removals, `--radius`, `color-scheme`, the global `:focus-visible` outline, the `type-*` utilities, the `shimmer` keyframe, the reduced motion rule and the bottom nav clearance rule, satisfies **AC-2**, **AC-3**, **AC-6**, **AC-7**, **AC-14**
3. Swap the fonts and add `viewport` in `src/app/layout.tsx`, satisfies **AC-5**, **AC-9**
4. Add `scripts/check-ui-classes.mjs`, the `check:ui` script and its lint-staged entry, satisfies **AC-15**
5. `shadcn add button spinner input label field badge card skeleton alert empty`, then apply the deviations in *Components built by #4* until `pnpm check:ui` passes, satisfies **AC-3**, **AC-4**, **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-14**
6. Build the shell (`SkipLink`, `AppHeader`, `NavLinks`, `BottomNav`, `AppShell`, `PageContainer`, `nav-items.ts`), satisfies **AC-7**, **AC-8**, **AC-9**, **AC-13**
7. Build `/dev/ui` (`layout.tsx` guard and `noindex`, server `page.tsx`, a client `gallery-demos.tsx` island for pending, field error, problem alert, status region and nav demos), satisfies **AC-5**, **AC-8**, **AC-16**
8. Restyle the scaffold home `src/app/page.tsx` with `PageContainer` and the `type-*` utilities, adding no fake feature, satisfies **AC-6**

## Consequences

**Positive**:
- Features #5 to #12 build screens on fixed tokens, components and accessibility rules instead of inventing them.
- Announcements, focus and reduced motion are designed once, so later screens inherit correct behaviour.
- The `check:ui` guard keeps future shadcn additions inside the system.
- No new runtime dependency.

**Negative / tradeoffs**:
- No dark mode for evening cooking yet.
- Every `shadcn add` needs manual edits before the guard passes; nova updates must be merged by hand.
- Type first cards rely on typography and spacing to feel premium.
- The pending pattern changed 0002's wording: the long "Reading the video…" text moved from the button into the status region (0002 AC-10 updated).
- Two web fonts add two font files to first load (self hosted and subset by `next/font`).
- `/dev/ui` and the guard script are extra code to maintain.

**Neutral**:
- `docs/design.md` is the visual source of truth; `design/*.html` stays as history.
- Recipe specific components are built by #8, #9 and #11, which decide their final contracts.
- The navigation shows nothing until a second real destination exists (#11).

## Follow-up

- [x] Spec 0002: AC-10 and *Pending UI* updated to this contract on 2026-10-01 (button label "Reading…", the full text in the form's status region, focus to the input after a failure, invalid link as a field error, other failures as `problem` alerts).
- [ ] #6 (web page link): decide the web method label and recipe site images, and its own pending copy for the status region.
- [ ] #5 (sign in): fill `AppHeader`'s `actions` slot with the account menu and style the Google button within Google's branding rules.
- [ ] #8, #9, #11: own the final screen contracts; build the recipe specific patterns on these components; report any foundation change back into `docs/design.md`.
- [ ] #11 and #12: add their entries to `nav-items.ts` when their routes exist.
- [ ] Deferred: dark mode (Sodrus dark values from `design/plan-screen.html` as a starting point, contrast checked again) and tap to check off ingredients and steps.
- [ ] `/develop`: apply the 2026-10-01 AC-11 update in `src/app/dev/ui/gallery-demos.tsx` (write the field error into the status region when the input already has focus) and mirror the AC-11 and AC-14 wording into `docs/design.md` (*Field parts*, the feedback table, *Motion*).
- [ ] Consider a pointer to `docs/design.md` and `pnpm check:ui` in root `AGENTS.md` `## Rules` and `## Commands` (`/sync` owns that edit).
