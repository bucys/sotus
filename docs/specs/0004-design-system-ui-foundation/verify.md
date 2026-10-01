# Verify: design system & UI foundation · spec 0004 · updated 2026-10-01
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Alpha result (2026-10-01): PASS
Every executable Alpha step passed with recorded evidence. Re-verified after the review round 2 fix (`flushSync` before focus in `gallery-demos.tsx`): at the focus event the input now carries `aria-invalid="true"` and both described by ids; every other step unchanged. Legend: `[x]` passed, `[~]` deferred QA, `[>]` carried to a later feature.
- `[~]` Deferred, non blocking until a public or production launch: real VoiceOver and screen reader reading, and the real phone software keyboard. Semantic implementation stays in place, and DOM level checks passed (roles, `aria-describedby`, `aria-invalid`, status region text sequence, focus position, 320 to 844px with no sideways scroll, 200% text).
- `[>]` Carried forward, not failing: a Radix popper under reduced motion (first menu arrives with #5) and a route that matches no nav item (a recipe page, #11).

## UI / manual
- [x] Open `docs/design.md` → it covers principles, every token with hex, role and contrast, type utilities, spacing, motion, icons, voice, component and shell contracts, the *After `shadcn add`* checklist, illustrative sketches, and names `design/*.html` as superseded → AC-1
- [x] `/dev/ui` at 375px → every colour token shows as a named swatch → AC-2, AC-16
- [x] Measure each pair in the spec's *Contrast table* (devtools or a contrast tool) → text pairs at least 4.5:1, input border and focus outline at least 3:1 → AC-3
- [x] `/dev/ui` field error demo → red border and red error text; the problem alert uses the paprika bar, not red → AC-4
- [x] `/dev/ui` with font requests blocked in devtools → page stays readable with no overlap; the `tabular-nums` sample digits line up → AC-5
- [x] `/dev/ui` → body text uses Hanken Grotesk, headings Bricolage Grotesque; every `type-*` utility is shown → AC-5, AC-6
- [x] Tab through `/dev/ui` → every control shows the solid 2px herb outline with its offset gap, including `default` buttons → AC-7
- [x] Fixture nav at 390px, Tab to the last control → it stays fully above the bottom bar → AC-7, AC-9
- [x] Load `/dev/ui`, press Tab once → "Skip to content" appears first; Enter → focus lands on `main` → AC-8
- [x] Tab and Shift+Tab through the whole page, use Enter and Space on buttons → visual order, no trap → AC-8
- [x] Nav demo → one `nav[aria-label="Main"]`, the current item has `aria-current="page"` → AC-8, AC-13
- [~] 320px wide, 200% text size, phone landscape, software keyboard open → no sideways scroll, focused field visible, controls at least 44px, inputs at 16px → AC-9
- [x] Type a link, press "Add recipe" → button shows the spinner and "Reading…", a second click does nothing, the status region reads the long message once → AC-10, AC-12
- [~] With VoiceOver on, type `bad`, click "Add recipe" → focus moves to the input, the error is read once through the field, the status region stays empty → AC-11
- [~] Still in the field, press Enter → focus stays, the error is read once through the status region, the typed value is kept → AC-11
- [~] Press Enter again with the same bad value → the same error is read again, exactly once → AC-11
- [~] Submit a link and wait for the demo failure → the problem alert is read once as an alert and focus moves to the input → AC-11, AC-12
- [~] Reload with VoiceOver on → the `tone="info"` alerts present on load are not announced on their own → AC-12
- [~] "Mount the assertive alerts" → each assertive alert is read once when mounted → AC-12
- [x] `/dev/ui?nav=one` → neither nav placement renders and `main` has no bottom padding; without the parameter both appear at their breakpoints → AC-13
- [x] Turn on reduced motion in the OS → skeleton is a static `muted` block, spinner is still, nothing transitions, button press does not scale, text progress still shows → AC-14
- [>] With reduced motion on, open any Radix popper menu (the first one arrives with #5) → it sits next to its trigger, not in the top left corner → AC-14

## Commands
- [x] `pnpm check:ui` → `check:ui ok` → AC-15
- [x] Add a temporary `.tsx` file under `src/components/` using `focus-visible:outline-none`, `focus:outline-none`, `outline-hidden` and `outline-0` in turn, run `pnpm check:ui` → each fails; delete the file → AC-15
- [x] Stage a fresh `shadcn add` component without the edits and try to commit → lint-staged runs `check:ui` and blocks the commit → AC-15
- [x] `pnpm build && pnpm start`, request `/dev/ui` → 404 → AC-16
- [x] View source of `/dev/ui` in dev → `robots` meta has `noindex` → AC-16
- [x] `grep -n transform src/app/globals.css` → no match inside the reduced motion block → AC-14

## Value sourcing
- [x] `NavLinks` with one item, then two → nothing renders with one, both placements with two → AC-13
- [>] Visit a route that matches no nav item → no item is marked current → AC-13
- [x] Field error with the input focused vs not focused → status region text comes only from the focused case, and equals the `FieldError` text → AC-11
- [x] Each page's `<title>` → unique per route (`/dev/ui` is "UI gallery") → AC-8

## Acceptance-criteria coverage
- AC-1 design.md step · AC-2 swatches · AC-3 contrast table · AC-4 field error vs problem alert · AC-5 fonts blocked and tabular figures · AC-6 type utilities · AC-7 focus outline and bar clearance · AC-8 skip link, keyboard, nav, titles · AC-9 phone fit and pending sizes · AC-10 pending button · AC-11 three focus and Enter steps plus value sourcing · AC-12 status region, info on load, assertive alerts · AC-13 nav rule and clearance · AC-14 reduced motion, popper, globals grep · AC-15 guard commands · AC-16 production 404 and noindex
