# src/components

Shared UI for Sotus. The contract is spec [0004](../../docs/specs/0004-design-system-ui-foundation/index.md);
the visual source of truth is [docs/design.md](../../docs/design.md). The live gallery of every token,
component and state is `/dev/ui` (development only, `src/app/dev/ui/`).

## Layout

- `ui/`: shadcn (`radix-nova`) primitives, **edited** after `shadcn add`: Button, Input, Label, Field, Alert, Badge, Card, Empty, Skeleton, Spinner, Separator, Avatar, DropdownMenu.
- `shell/`: `AppShell` (skip link, header, `<main id="main" tabIndex={-1}>`, bottom nav), `PageContainer`, and `NavLinks`, the only client component in the shell.
- `auth/`: `SignInButton`, `AccountMenu` (avatar plus Sign out) and `AuthUnavailable`. Auth logic stays in `src/lib/auth/` (see its AGENTS.md).
- `shell/nav-items.ts`: the navigation list. Add an entry only when its route exists; navigation renders nothing with fewer than two.

## Rules

- **After `shadcn add`**, apply the deviations in the _After `shadcn add`_ table in `docs/design.md` until `pnpm check:ui` passes. The guard (`scripts/check-ui-classes.mjs`) also runs on staged `.tsx` files before each commit.
- **Focus**: one global `:focus-visible` outline in `globals.css`. Never `outline-none`, `outline-hidden` or `outline-0` on a control. The single allowed exception, `<main>` in `shell/app-shell.tsx`, is matched by exact file and line in the guard's allowlist.
- **Colour**: semantic tokens only (`bg-primary`, `text-muted-foreground`); no raw palette colours, hex values, or opacity modifiers on text, `input`, `ring` or `destructive`. Red (`destructive`) means "change what you typed" only; a system failure uses `Alert tone="problem"`.
- **Motion**: transforms and entry animations behind `motion-safe:`. The reduced motion rule in `globals.css` stops animations and transitions but never resets `transform` (Radix Popper positions overlays with it).
- **Announcements**: `Alert` sets look (`tone`) and announcement (`announce`) separately. Forms mount one stable `role="status"` region before work starts. A field error is announced through exactly one channel: focus plus `aria-describedby`, or the status region when the input already has focus. Commit the error with `flushSync` before moving focus.
- **Size**: standalone controls at least 44px (`min-h-11`, `size-11`), inputs at 16px text.

_Drafted by /sync from the introducing change, worth a quick human pass._
