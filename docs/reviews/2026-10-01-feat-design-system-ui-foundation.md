# Review, feat/design-system-ui-foundation, 2026-10-01

**Reviewed by**: claude-opus-5-5 (author model not recorded)
**Scope**: 32 files (30 changed plus the untracked spec 0004), branch vs main
**Verdict**: Changes requested

## Summary
The branch adds the Sotus design system: hex tokens and type utilities in `globals.css`, edited shadcn primitives, a server first app shell with one client `NavLinks`, a dev only `/dev/ui` gallery and a `check:ui` class guard. Overall it follows spec 0004 closely and is tidy. Typecheck, lint, format and `check:ui` all pass. Three things need fixing first: the reduced motion rule's `transform: none !important` goes further than the spec and will break every Radix popper; the guard misses the outline utilities that already caused one focus regression on this branch; and the field error pattern the gallery models is silent in the most common case (Enter pressed inside the field).

## Major

### 🟠 Reduced motion `transform: none !important` will break positioned overlays, `src/app/globals.css:174`
**Problem**: The global `prefers-reduced-motion` block also sets `transform: none !important` on every element. Spec 0004 (Motion, "Implementation") asks only for `animation: none !important; transition: none !important`, and removes transforms with the `motion-safe:` variant. A `!important` stylesheet rule beats inline styles. Radix Popper, used by DropdownMenu, Popover, Select and Tooltip, positions its wrapper with an inline `transform: translate(x, y)`, and toast libraries do the same. The rule also misses its target: Tailwind v4 `scale-*`, `translate-*` and `rotate-*` set the separate `scale`, `translate` and `rotate` properties, not `transform`.
**Why it matters**: For a user with reduced motion on, every future menu or popover would render at the top left corner of the viewport. The first one is likely the account menu in #5's `actions` slot. Nothing on this branch uses a popper yet, so no check run here would show it.
**Suggested fix**: Delete the `transform` line and keep transforms opt in with `motion-safe:`, as the spec says. If a backstop is still wanted, add a `check:ui` rule against unprefixed `active:scale-` and `hover:scale-` instead.

### 🟠 `check:ui` misses the outline utilities that remove the focus indicator, `scripts/check-ui-classes.mjs:15`
**Problem**: The global `:focus-visible` outline sits in `@layer base` (`globals.css:144`), so any outline utility beats it. The guard only catches a bare `outline-none` at the start of a token. It passes `focus-visible:outline-none`, `focus:outline-none`, `outline-hidden` (the Tailwind v4 name that newer shadcn components use), `outline-0` and `focus-visible:outline-*` overrides (all checked against the regex).
**Why it matters**: Commit 4c06467 ("restore global focus outline on controls") shows this regression has already happened once. AC-15's purpose is that "a newly generated shadcn component cannot silently bring back incompatible styles", and a lost focus outline is the most harmful such style (AC-7, WCAG 2.4.7).
**Suggested fix**: Ban any `outline-(none|hidden|0)` token with or without a variant prefix, plus `focus(-visible)?:outline-`. Allow the one intended use (`main`'s `focus-visible:outline-0` in `app-shell.tsx:31`) through an explicit allowlist or an inline marker comment. Add the pattern to the After `shadcn add` table in `docs/design.md` and the spec.

### 🟠 The field error is not announced when focus is already in the input, `src/app/dev/ui/gallery-demos.tsx:40-43`
**Problem**: AC-11 says the field error is "read through the focused field": focus moves to the first invalid input, which `aria-describedby` points at the error. The common way to submit is pressing Enter while typing, and then the input already has focus. `inputRef.current?.focus()` does nothing, so no focus event fires. Screen readers generally do not announce a change to `aria-describedby` on the focused element, and `FieldError` deliberately has no live role. The same happens when a second submit returns the same error.
**Why it matters**: The gallery is the pattern #6 and #7 will copy, so a screen reader user who presses Enter on a bad link would hear nothing. This is a gap in the contract more than in the code. The deferred screen reader check would probably have caught it, but it follows from the design, not from the device.
**Suggested fix**: Settle it in the spec (through /architect), then in the demo. Two options: write the error text into the form's existing stable `role="status"` region when focus is already on the input, or always put a short summary of the error in that region. Either way, only one channel should speak, so the error is not read twice.

## Minor

### 🟡 `check:ui` false negatives on raw colours, opacity and size, `scripts/check-ui-classes.mjs:21-31`
**Problem**: The guard passes `fill-red-500`, `stroke-*`, `ring-red-500`, `text-black`, `border-[#fff]` and `fill-[#fff]`. It also passes opacity on other text colour tokens such as `text-primary/80` and `text-highlight-ink/70`, which AC-3 bans ("any text colour token"). It misses `h-8!` (the v4 important modifier) and `h-10` and `size-10`, shadcn's common `lg` size at 40px, which is below 44px.
**Why it matters**: Each of these silently undercuts the contrast table or the 44px target, the exact things the guard exists to protect.
**Suggested fix**: Widen the prefixes to `(bg|text|border|ring|fill|stroke|outline|from|via|to)-`, ban `text-(primary|highlight-ink|secondary-foreground|accent-foreground|card-foreground|primary-foreground)/\d+` or more simply `text-[a-z-]+/\d+`, allow a trailing `!`, and add `h-10` and `size-10`.

### 🟡 `check:ui` false positives will push authors to workarounds, `scripts/check-ui-classes.mjs:30,38`
**Problem**: The size rule fires on any `h-6`…`h-9` or `size-6`…`size-9`, including non interactive ones (skeleton rows, decorative icons, avatars). The spec limits the rule to interactive elements. The animation lookbehind accepts `motion-safe:` only when it sits directly before `animate-`, so `motion-safe:data-open:animate-in` and `motion-safe:hover:animate-spin` are flagged. Entry animations such as `data-open:animate-in` are flagged as "loop" animations.
**Why it matters**: The script cannot tell interactive elements apart, so authors will reach for `h-[2rem]` to get past it, which defeats the point.
**Suggested fix**: Accept `motion-safe:` anywhere in the variant chain. Document an escape hatch, for example a `// check-ui-ignore-next-line` comment, for decorative sizes instead of arbitrary values.

### 🟡 Overlapping lint-staged globs run concurrently, `.lintstagedrc.json:2-4`
**Problem**: `*.tsx` matches the same files as `*.{ts,tsx,mjs}`. lint-staged runs separate globs concurrently by default, so `check-ui-classes.mjs` can read a file while `eslint --fix` or `prettier --write` is rewriting it. lint-staged's docs warn about overlapping globs for this reason.
**Why it matters**: The read can hit a truncated file and give a flaky pass or fail. It is rare but nondeterministic.
**Suggested fix**: Put `node scripts/check-ui-classes.mjs` at the end of the `*.{ts,tsx,mjs}` array (the script already ignores files outside its roots, and could filter `.tsx` itself), or set `concurrent: false`.

### 🟡 The guard skips `.ts` files, `scripts/check-ui-classes.mjs:54`
**Problem**: The full scan keeps only `.tsx`, and lint-staged only sends `.tsx`. A `cva` table moved into a `.ts` file (for example `button-variants.ts`, a common shadcn split) is never checked.
**Suggested fix**: Scan `.ts` and `.tsx` in both modes.

### 🟡 The `/dev/ui` production guard lives only in the layout, `src/app/dev/ui/layout.tsx:11`
**Problem**: The Next 16 docs (`02-guides/authentication.md`, "Layouts and auth checks") say a layout "does not control whether the rest of the route renders… a layout that hides or swaps them does not stop them from running or from appearing in the RSC Payload". `notFound()` in the layout still returns a 404, which matches the spec. But the gallery page and its client demos are still built and executed in production.
**Why it matters**: The impact is low, since the gallery holds no data. The pattern is still worth avoiding before someone copies it for a guard that matters. `searchParams` makes the page dynamic, so it runs on every request.
**Suggested fix**: Also call `notFound()` at the top of `GalleryPage` (or share a tiny `assertDevelopment()` helper). Confirm with `pnpm build && pnpm start` that `/dev/ui` and `/dev/ui?nav=one` both return 404.

### 🟡 With reduced motion, the skeleton is a static gradient, not plain `muted`, `src/app/globals.css:157-175`
**Problem**: `animation: none` stops the shimmer but leaves `background-image`. At the default `background-position` the block shows a muted to tinted gradient frozen at its right edge. AC-14 says "the skeleton is a static `muted` block". shadcn's own `shimmer` utility also clears `background-image` under reduced motion.
**Suggested fix**: Add `.skeleton-shimmer { background-image: none; }` inside the reduced motion media block.

## Nits
- ⚪ `src/components/ui/button.tsx:20`, `destructive` has `hover:bg-destructive`, which does nothing. Drop it or give it a hover token.
- ⚪ `src/components/ui/button.tsx:9` (and `input.tsx:10`), `disabled:pointer-events-none` means `disabled:cursor-not-allowed` never shows, though the spec wants that cursor.
- ⚪ `src/components/ui/button.tsx:57-67`, with `asChild` the destructured `disabled` is silently dropped. Consider typing it out of the `asChild` branch.
- ⚪ `scripts/check-ui-classes.mjs:53`, `file.includes(root)` is a substring match on absolute paths. A repo cloned under a parent folder containing `src/app` would widen the scope. Compare `path.relative(process.cwd(), file)` with `startsWith`.
- ⚪ `src/app/dev/ui/page.tsx:56-64`, `typeUtilities` repeats each name as `className`. A plain string array is enough.
- ⚪ `src/components/ui/field.tsx:33`, `FieldLegend` still uses `text-sm` and `text-base` rather than the type utilities.

## Strengths
- The `Button` props union is correct and small. `asChild` together with `pending` or `pendingLabel` fails to type check, pending uses native `disabled`, and the spinner is hidden from assistive technology.
- The shell holds to the contract. `NavLinks` is the only client component, the icon map is the right workaround for the Server to Client boundary (with a "why" comment), active matching handles `exact` and `prefix` correctly (prefix `/` cannot match everything), and both navigations, the bottom clearance and `scroll-padding-bottom` share one `>= 2` rule and the same `md` breakpoint.
- `Alert` cleanly separates `tone` from `announce`, and the gallery's status region is mounted before work starts, as AC-12 requires.
- Tokens, fonts, viewport and type utilities match spec 0004 value for value. The `?nav=one` demo is a cheap way to prove the one destination rule.

## Test coverage
TESTS = none-by-design. Typecheck, lint, format and `pnpm check:ui` all pass on the branch. Typecheck cannot catch these:
- the overlay breakage under reduced motion: no popper exists yet, so `/check verify` for #5 should open its first menu with reduced motion on;
- the silent field error on Enter: it needs the deferred screen reader check, or a manual check that the status region text changes.
