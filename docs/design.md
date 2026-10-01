# Sotus design system

Source of truth for how Sotus looks and behaves. Built from [spec 0004](specs/0004-design-system-ui-foundation/index.md). Token values live in `src/app/globals.css`; the hex values below must match it.

`design/*.html` (directions, review screen, plan screen) are **superseded references**. They show where the look came from. Nobody builds from them.

## Principles

1. **The food is the hero, not the interface.** With few photos, the recipe title and typography carry the page.
2. **Warm and appetizing, never sterile.** Warm neutrals (oat, ink brown), herb green leading, grotesque type. No cream and serif cliché.
3. **Readable at a glance.** Big type, 44px targets, one hand reach, tabular figures. State is shown by shape and words, never by colour alone.
4. **Calm language.** A failure is explained, never shouted.
5. **Restraint.** One accent leads. Motion only where it explains something. No decorative gradients, glows or glass.

### What changed from the old "Sodrus" direction

**Kept**: the hero rule, the oat, surface and ink neutrals, herb green leading with paprika as a small highlight, Bricolage Grotesque with Hanken Grotesk, calm language (no red for "not sure"), big targets and type, restrained motion.

**Outdated by the product model**: the review draft screen (recipes are saved automatically and are read only), the plan screen (meal plans are deferred), the Plan and Shopping tabs, calorie meta lines, photo first cards, Lithuanian copy, the dark theme (deferred).

**Redesigned from scratch**: home and library, the add link flow and its one minute wait, the recipe page with provenance, the saved collection, navigation, and the empty, loading and error states.

## Colour

Light only. Hex is the source of truth. Components use semantic utilities (`bg-card`, `text-muted-foreground`), never raw colours. Dark mode is out of scope; token names are final, so a later `.dark` block only adds values.

| Token | Hex | Role |
|---|---|---|
| `background` | `#F4EEE1` | Page (oat) |
| `foreground` | `#221E17` | Body text (ink) |
| `card`, `popover` | `#FBF7EE` | Raised surfaces |
| `card-foreground`, `popover-foreground` | `#221E17` | Text on raised surfaces |
| `primary` | `#3F5230` | Herb: `default` buttons, active nav item, links |
| `primary-foreground` | `#FBF7EE` | Text on `primary` |
| `primary-hover` | `#2E3D22` | Hover and pressed `default` button |
| `secondary`, `muted` | `#EFE7D6` | Quiet fills: secondary buttons, skeleton base, `info` tone |
| `secondary-foreground` | `#221E17` | Text on quiet fills |
| `muted-foreground` | `#5C5344` | Meta text, descriptions, inactive nav items |
| `accent` | `#E6DCC8` | The hover surface for `secondary`, `outline`, `ghost` and menu rows |
| `accent-foreground` | `#221E17` | Text on `accent` |
| `destructive` | `#A63A24` | Field validation errors and destructive actions only |
| `destructive-foreground` | `#FBF7EE` | Text on a solid `destructive` fill |
| `border` | `#E2D8C4` | Decorative hairlines only |
| `input` | `#8F826A` | Input borders |
| `ring` | `#3F5230` | Focus outline |
| `highlight` | `#D2803A` | Paprika, decorative fill only: `problem` side bar, shimmer tint |
| `highlight-foreground` | `#221E17` | The only text allowed on `highlight` |
| `highlight-ink` | `#9A5220` | Paprika as text or icon colour (the `problem` icon) |

### Measured contrast

| Pair | Ratio | Limit |
|---|---|---|
| `foreground` on `background` / `card` / `muted` / `accent` | 14.35 / 15.51 / 13.48 / 12.19 | 4.5 |
| `muted-foreground` on `background` / `card` / `muted` / `accent` | 6.54 / 7.08 / 6.15 / 5.56 | 4.5 |
| `primary-foreground` on `primary` / `primary-hover` | 7.98 / 10.87 | 4.5 |
| `primary` as text on `background` / `card` / `muted` / `accent` | 7.38 / 7.98 / 6.94 / 6.27 | 4.5 |
| `highlight-foreground` on `highlight` | 5.44 | 4.5 |
| `highlight-ink` on `background` / `card` / `muted` | 5.04 / 5.45 / 4.74 | 4.5 (never on `accent`: 4.29) |
| `destructive` text on `background` / `card` / `muted` | 5.59 / 6.04 / 5.25 | 4.5 |
| `destructive-foreground` on `destructive` | 6.04 | 4.5 |
| `input` border on `card` / `background` / `muted` | 3.53 / 3.26 / 3.07 | 3 |
| `ring` outline on `background` / `card` / `muted` | 7.38 / 7.98 / 6.94 | 3 |
| `highlight` fill on `card` (decorative, never alone) | 2.85 | none |
| `border` hairline on `card` (decorative, cards are not controls) | 1.32 | none |

Rules:

- `highlight` never carries meaning alone. The only text on it is `highlight-foreground`.
- No opacity modifier (`/50`, `/20`) on `input`, `ring`, `destructive` or any text colour token.
- Red (`destructive`) means "change what you typed" or "this destroys something". A system or extraction outcome ("we couldn't read that link") uses the paprika `problem` tone, never red.
- Disabled controls use `opacity-50` and `cursor-not-allowed`.
- `viewport.themeColor` is `#F4EEE1`.

## Typography

Fonts load in `src/app/layout.tsx` with `next/font/google`: Bricolage Grotesque as `--font-bricolage` (titles) and Hanken Grotesk as `--font-hanken` (text). Utilities are defined in `globals.css`.

| Utility | Family | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `type-display` | Bricolage | 2rem / 2.25rem | 600 | -0.02em | Main title of a detail page |
| `type-heading` | Bricolage | 1.5rem / 1.875rem | 600 | -0.01em | Screen titles |
| `type-title` | Bricolage | 1.25rem / 1.625rem | 600 | -0.005em | Section titles, the wordmark |
| `type-body-lg` | Hanken | 1.0625rem / 1.75rem | 400 | 0 | Long reading text |
| `type-body` | Hanken | 1rem / 1.5rem | 400 | 0 | Default text, input text |
| `type-label` | Hanken | 0.9375rem / 1.25rem | 500 | 0 | Button text, field labels |
| `type-caption` | Hanken | 0.875rem / 1.25rem | 400 | 0 | Meta lines, descriptions, nav labels |

- Sentence case everywhere. No uppercase eyebrows.
- `text-balance` on headings, `text-pretty` on paragraphs.
- Amounts and counts use `tabular-nums`.
- The heading level (`h1` to `h3`) follows the document outline. The utility follows the visual need. Set them independently. No base rule ties a heading element to a style.
- Weight can be raised per element (`font-semibold` on a `type-body-lg` card title) without a new utility.
- The wordmark is `type-title` with the text "Sotus".
- Tabular figures: the `/dev/ui` gallery shows a `tabular-nums` sample. If Hanken Grotesk digits do not line up there, record the fallback here: amounts right aligned with proportional digits. _Not needed so far; check on the gallery._

## Space, layout, shape, elevation

- **Spacing steps**: 4, 8, 12, 16, 24, 32, 48px (Tailwind `1, 2, 3, 4, 6, 8, 12`).
- **Gutters**: 16px on phones, 24px from `md` (768px).
- **Widths** (`PageContainer width`): `reading` is `max-w-2xl` (672px), `wide` is `max-w-5xl` (1024px).
- **Radius**: `--radius` is `0.75rem`. Cards `rounded-lg`, controls `rounded-md`, badges `rounded-full`.
- **Elevation**: cards use a hairline `border` and no shadow. Only menus and popovers take `shadow-sm`. The bottom bar is a solid `card` surface with a top hairline, no blur.
- **Touch targets**: standalone controls are at least 44px tall and wide (`min-h-11`, never a fixed height, so text can wrap). Inputs use 16px text at every width. Inline text links inside running text are exempt.

## Motion

| Moment | Effect | Timing | Under reduced motion |
|---|---|---|---|
| Hover and press | Background to `accent` or `primary-hover` | 150ms ease out | Instant colour change |
| Button press | `motion-safe:active:scale-[0.98]` | 150ms | No transform |
| Skeleton | `shimmer` keyframe, `muted` to a faint paprika tint and back | 1.6s linear loop | Static `muted` block |
| Spinner | `animate-spin` | loop | Still icon, `pendingLabel` carries the meaning |
| Alert entry (optional) | `motion-safe:animate-in fade-in` | 200ms | None |

Under `prefers-reduced-motion: reduce` all motion is removed (not shortened). A global rule sets `animation: none !important; transition: none !important`; motion transforms such as the button press use the `motion-safe:` variant, so they never apply. The global rule never resets `transform`, `translate`, `scale` or `rotate`: positioned overlays (Radix Popper menus, popovers, selects, tooltips) place themselves with an inline transform that must keep working. No JavaScript animation library.

## Icons

lucide only. 20px in controls, 22px in the bottom bar, `strokeWidth={1.75}`. Decorative icons are `aria-hidden`. No brand logos as icons. The active nav item uses stroke 2.25 instead of a fill.

## Voice

Plain, calm, second person, sentence case, no exclamation marks, no "Oops". Say what happened and what to do next. Feature specs own their own copy.

## Focus and keyboard

One global rule draws every focus indicator: `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`. Components never add their own ring. When the bottom nav renders, `html` gets `scroll-padding-bottom` equal to its height plus the safe area, so a focused control is never hidden behind it.

Every page sets a unique `title` in its metadata. On client navigation Next.js moves focus to the changed segment and announces `document.title`; Sotus adds no focus code of its own.

## Components

Built by feature #4. Recipe specific parts (recipe card, provenance line, ingredient row, save toggle) belong to features #8, #9 and #11.

| Component | File | Contract |
|---|---|---|
| `Button` | `ui/button.tsx` | Variants `default` (herb), `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes `default` (`min-h-11 px-4`) and `icon` (`size-11`). Props are a union: with `asChild` the `pending` and `pendingLabel` props do not type check. With `pending`: native `disabled`, `Spinner` plus `pendingLabel` (about 12 characters, for example "Reading…"), a second activation does nothing |
| `Spinner` | `ui/spinner.tsx` | `aria-hidden="true"`, no role |
| `Input` | `ui/input.tsx` | `min-h-11`, 16px text, `bg-card`, `input` border |
| `Label` | `ui/label.tsx` | `type-label` |
| `Field` parts | `ui/field.tsx` | `Field`, `FieldLabel`, `FieldDescription`, `FieldError`. A visible label always; a placeholder is never the label. The form wires ids with `useId()`: the input's `aria-describedby` lists the description id and, when present, the error id. An error sets `aria-invalid="true"` on the input and `data-invalid` on `Field`, and keeps the typed value. `FieldError` has no `role="alert"`. After a failed submit, focus moves to the first invalid input, or to the form's main input when the failure is not tied to a field. If the invalid input already has focus (Enter pressed while typing, or a repeat submit), focus stays and the error text goes into the form's `role="status"` region instead, visually hidden: clear the region, then set the text on the next frame, so a repeated error is read again |
| `Alert` | `ui/alert.tsx` | `tone`: `info` (muted surface) or `problem` (card surface, paprika side bar, `highlight-ink` icon, ink text). `announce`: `off` (default, no role), `polite` (`role="status"`), `assertive` (`role="alert"`, only for a failure newly returned by an action) |
| `Badge` | `ui/badge.tsx` | `rounded-full`, no opacity hovers |
| `Card` | `ui/card.tsx` | Hairline border, no shadow, `rounded-lg`, `bg-card` |
| `Skeleton` | `ui/skeleton.tsx` | Shimmer, `aria-hidden="true"` |
| `Empty` parts | `ui/empty.tsx` | Media icon, title, description, at most one action |

### Pending, loading and feedback

| Situation | Visual | Announcement | Focus |
|---|---|---|---|
| Action running | Button with `Spinner` and `pendingLabel`, optional `Skeleton` preview (`aria-hidden`) | One stable `role="status"` region mounted with the form, empty when idle, text changes when work starts | Unchanged |
| Field validation error | Red input border, `FieldError` text | Through the input's `aria-describedby` when focus moves to it; through the form's status region (cleared, then set on the next frame) when the input already had focus. Never both | To the first invalid input (unchanged if already there) |
| Extraction or system failure | `Alert tone="problem"` under the form | `announce="assertive"`, once, when inserted | To the form's main input |
| Success | Owning feature redirects | Next.js route announcer | Next.js |
| Static info on load | `Alert tone="info"` | `announce="off"` | Unchanged |
| Route loading | `loading.tsx` with `Skeleton` blocks | Visually hidden `role="status"` text "Loading" | Unchanged |
| Empty list | `Empty` with one action | None | Unchanged |

Every announced moment speaks through exactly one channel: focus plus `aria-describedby`, the status region, or an assertive alert. Never two at once.

## Shell

```
<body>
  AppShell (Server, mounted by the signed in layout of the owning feature)
    SkipLink                  first focusable, targets #main
    AppHeader                 wordmark to "/", NavLinks inline (md and up), actions slot
    <main id="main" tabIndex={-1}>
      page content            the page owns its back link, h1 and page actions
    </main>
    BottomNav                 below md, fixed, only with 2+ destinations, safe area padded
```

- `AppHeader` is stable across pages: no page title, no back link.
- `NavLinks` (client, `usePathname`) renders `<nav aria-label="Main">`, icon plus label, `aria-current="page"` on the match. It renders nothing when fewer than two destinations exist.
- Destinations live in `shell/nav-items.ts`, only for routes that exist. `/` matches `exact`, the rest `prefix`. A route that matches nothing (a recipe page) has no active item.
- `main` gets bottom padding `calc(4rem + env(safe-area-inset-bottom))` below `md`, only when the bottom nav renders.
- `viewport = { themeColor: "#F4EEE1", viewportFit: "cover" }`. No `interactiveWidget` override.

## After `shadcn add`

Every new shadcn component needs these edits. `pnpm check:ui` (`scripts/check-ui-classes.mjs`) fails on the patterns, and lint-staged runs it on staged `.tsx` files.

| Banned pattern | Why | Replace with |
|---|---|---|
| `focus-visible:ring-`, `focus-visible:border-ring`, `aria-invalid:ring-`, `outline-ring/` | Semi transparent focus ring | Nothing, the global outline covers it |
| `outline-none`, `outline-hidden`, `outline-0`, alone or with a `focus:` or `focus-visible:` prefix | Removes the global focus outline | Nothing, keep the global outline. One allowlisted exception, below |
| `dark:` | No dark theme yet | Nothing |
| `text-white`, `bg-black`, `bg-white`, palette colours (`red-`, `green-`), `bg-[#`, `text-[#` | Raw colours bypass tokens | Semantic tokens |
| Opacity on `input`, `ring`, `destructive`, `foreground`, `muted-foreground` | Breaks the contrast table | Solid tokens, `accent` for hover |
| `h-6` to `h-9`, `size-6` to `size-9` on interactive elements | Below 44px | `min-h-11`, `size-11` |
| `active:translate-y-px`, unprefixed `animate-` on loops | Motion outside the rules | `motion-safe:` variants |

Allowlist: the script accepts exactly one line, `"flex-1 focus-visible:outline-0",` in `src/components/shell/app-shell.tsx`, the `<main id="main" tabIndex={-1}>` that only the skip link focuses (an outline around the whole page would be noise). It matches by file and exact line text, so a reformat of that line, or the same class anywhere else, fails the guard. Add an entry only for an element that is never a control.

## Illustrative screens

**These sketches are illustrative only.** They show how the foundation parts compose. They are not data or interaction contracts. The owning feature's spec defines each screen's final data, copy and behaviour. [Spec 0003](specs/0003-data-model/index.md) is authoritative for recipe semantics: `added_by` is attribution only, collection membership comes from `saved_recipes`, canonical recipes are not user editable. Pagination and counts belong to the owning features.

- **Home and library (#9, add form from #6 and #7)**: `AppShell`, a `card` add form (label, input, description, `default` button, status region), the screen `h1`, a recipe list (one column on phones, two from `md`), `Empty` when there is nothing yet.
- **Recipe card (#9, reused by #11)**: type first, the whole card one link, a title and a source line in `type-caption`. A YouTube thumbnail only when the data has one.
- **Recipe page (#8)**: a back link to the library, the title (`h1`, `type-display`), a provenance line, the save control (#11), ingredients, steps, a source section.
- **My recipes (#11)**: the same card list for the user's collection, `Empty` pointing back to the library.
- **Sign in (#5)**: outside `AppShell`, a centred reading column with the wordmark, one line of purpose and the Google button.
- **Errors**: a route `error.tsx` shows `Alert tone="problem" announce="assertive"` with a `secondary` "Try again" button that receives focus.
