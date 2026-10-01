# Review, feat/design-system-ui-foundation (round 2), 2026-10-01

**Reviewed by**: claude-opus-5-5 (author model not recorded)
**Scope**: 33 files (30 changed vs main plus the untracked spec 0004 and first review), branch vs main
**Verdict**: Approve with nits

## Summary
This round checks the fixes for the first review. All three majors are closed: the reduced motion rule no longer touches `transform`, `check:ui` now catches the outline removal utilities with any variant prefix, and the field error demo speaks through the status region when the input already has focus, matching the updated AC-11. The `/dev/ui` page guard and the static skeleton fixes are also correct. Typecheck, lint and `pnpm check:ui` pass. What remains is minor: the one frame clear and set gap in the AC-11 pattern may be too short for some screen readers to notice a repeat, focus is moved before React commits the error attributes, and the "After `shadcn add`" tables were not updated with the new outline rule.

## Status of the first review's findings

| First review finding | Status |
|---|---|
| 🟠 Reduced motion `transform: none !important` | **Fixed**. `globals.css:169-179` sets only `animation` and `transition`; AC-14 and `docs/design.md` Motion now say why transforms are left alone. Button press uses `motion-safe:active:scale-[0.98]`. |
| 🟠 `check:ui` misses outline utilities | **Fixed** in the script (`scripts/check-ui-classes.mjs:15`), with a file plus exact line allowlist for `main`. Still open in part: the docs tables were not updated (see Minor below). |
| 🟠 Field error silent when focus is already in the input | **Fixed**, settled by the AC-11 spec change and implemented in `gallery-demos.tsx:45-51`. Two timing caveats below. |
| 🟡 Raw colour, opacity and size false negatives | **Still open**, `scripts/check-ui-classes.mjs:19-32` unchanged. |
| 🟡 `check:ui` false positives (size on decorative, `motion-safe:` chain) | **Still open**, lines 30 and 38 unchanged. |
| 🟡 Overlapping lint-staged globs | **Still open**, `.lintstagedrc.json:2-4` unchanged. |
| 🟡 Guard skips `.ts` files | **Still open**, `scripts/check-ui-classes.mjs:68`. |
| 🟡 `/dev/ui` guard only in the layout | **Fixed**, `page.tsx:101-103` also calls `notFound()`. |
| 🟡 Skeleton keeps a frozen gradient under reduced motion | **Fixed**, `globals.css:176-178` clears `background-image`; `Skeleton` keeps `bg-muted`, so it is a plain muted block as AC-14 says. |
| ⚪ Six nits (button hover, disabled cursor, `asChild` drops `disabled`, `file.includes(root)`, `typeUtilities` duplication, `FieldLegend` text sizes) | **All still open**, author's discretion. |

## Minor

### 🟡 One animation frame may be too short to make a repeat error speak again, `src/app/dev/ui/gallery-demos.tsx:48`
**Problem**: On a repeat Enter, the region goes from the error text to empty (committed in the submit microtask) and back to the same text one frame later. Browsers batch accessibility tree updates, and VoiceOver in particular drops an identical live region message that arrives within a short window. With about 16 ms between the two mutations, the assistive technology can see "same text as before" and say nothing. The `requestAnimationFrame` is also never cancelled, so a stale callback can land after a later submit.
**Why it matters**: The third verify step for AC-11 ("press Enter again, the same error is read again") is the one most likely to fail when the deferred screen reader QA runs, and #6 and #7 will copy this code.
**Suggested fix**: Keep the clear then set shape but use a longer gap (a `setTimeout` of about 100 to 150 ms is the common choice), keep the timer id in a ref and clear it at the start of each submit. Or render the announcement in a keyed element so a repeat is a new node. If the delay changes, update the "next frame" wording in AC-11 and `docs/design.md` through /architect.

### 🟡 Focus moves before React commits the error attributes, `src/app/dev/ui/gallery-demos.tsx:50`
**Problem**: `setFieldError` is batched and only commits after the handler returns, but `inputRef.current?.focus()` runs synchronously inside it. On the first failed submit by click, the focus event fires while the input still has no `aria-invalid`, its `aria-describedby` still lacks the error id, and `FieldError` is not in the DOM yet. The same order applies to the failure path at line 61 after the `await`.
**Why it matters**: AC-11's "read through the focused field" depends on those attributes being present when the screen reader reads the focused input. Chromium usually coalesces the updates so it works, but other engines may read the stale state. DOM level checks after the fact cannot see the order. This existed in round 1 too.
**Suggested fix**: Move focus after the commit, either with `flushSync(() => setFieldError(message))` before calling `focus()`, or by setting a "focus the input" flag and focusing in a `useEffect`. Do the same for the failure path.

### 🟡 The "After `shadcn add`" tables do not list the outline rule, `docs/design.md:186` and `docs/specs/0004-design-system-ui-foundation/index.md:202`
**Problem**: The script header says its banned list "mirrors After shadcn add in docs/design.md", and AC-15 defines the guard by that table. The new `outline-(none|hidden|0)` rule and its one allowlisted line are in neither table.
**Why it matters**: The next person running `shadcn add` reads the table for what to strip, and the docs and the guard now disagree.
**Suggested fix**: Add a row for `outline-none`, `outline-hidden`, `outline-0` (any variant prefix) with "Nothing, the global outline covers it", and note the single `main` exception. The spec row goes through /architect.

### 🟡 Carried from round 1, still open
- `scripts/check-ui-classes.mjs:19-32`, raw colour, opacity and size false negatives (`fill-`, `stroke-`, `ring-` palette colours, `text-primary/80`, `h-10`, `size-10`, trailing `!`).
- `scripts/check-ui-classes.mjs:30,38`, false positives on decorative sizes and on `motion-safe:` anywhere but directly before `animate-`.
- `.lintstagedrc.json:2-4`, overlapping globs run `check:ui` concurrently with `eslint --fix` and `prettier --write`.
- `scripts/check-ui-classes.mjs:68`, the full scan and lint-staged skip `.ts` files.

## Nits
- ⚪ `scripts/check-ui-classes.mjs:15`, the outline rule still passes `focus-visible:outline-transparent` and the v3 style `!outline-none`, both of which hide the focus outline.
- ⚪ `src/components/ui/button.tsx:20`, `hover:bg-destructive` does nothing (round 1).
- ⚪ `src/components/ui/button.tsx:9`, `disabled:pointer-events-none` hides `disabled:cursor-not-allowed` (round 1).
- ⚪ `src/components/ui/button.tsx:57-67`, `disabled` is silently dropped with `asChild` (round 1).
- ⚪ `scripts/check-ui-classes.mjs:67`, `file.includes(root)` substring match on paths (round 1).
- ⚪ `src/app/dev/ui/page.tsx:57-65`, `typeUtilities` repeats each name as `className` (round 1).
- ⚪ `src/components/ui/field.tsx:33`, `FieldLegend` still uses `text-sm` and `text-base` (round 1).

## Strengths
- The reduced motion fix is done the right way: the rule is narrowed, the spec and `docs/design.md` explain why, and verify.md carries a popper step forward to #5 instead of pretending it was checked.
- The outline allowlist matches on file and exact trimmed line, so it cannot hide a second use, and a reformat fails loudly rather than silently.
- AC-11 was settled in the spec before the code changed, and the demo keeps one channel per case: the status region only speaks when focus did not move.
- Typecheck, lint and `check:ui` pass on the branch.

## Test coverage
TESTS = none-by-design. The gate is typecheck plus `/check verify`, and both pass for the executable steps. The two AC-11 timing caveats above are invisible to DOM level checks; the deferred screen reader QA should run the three Enter steps in VoiceOver on Safari specifically, since that is where both risks are most likely to show.
