<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sotus

Turns a cooking video or recipe web page into a clean, reusable recipe, keeps it in a shared
library and your own collection, and helps answer "what should I cook today?".

## Stack

- **Language / Runtime**: TypeScript (strict), Node.js 24 LTS on Vercel (Fluid compute), functions pinned to region `fra1`
- **Framework**: Next.js 16 App Router (Turbopack), React 19, Server Components first
- **Key dependencies**: `@supabase/ssr` + `@supabase/supabase-js` (Postgres, Google sign in, RLS), `@google/genai` (Gemini Flash), Tailwind CSS v4 + shadcn/ui (`radix-nova` style, CSS variables), `lucide-react`
- **Package manager**: pnpm 10.33.2, pinned with `packageManager`; `pnpm-lock.yaml` is committed
- **Data and hosting**: one Supabase cloud project, `sotus-dev` (eu-central-1), shared by all three Vercel environments. Do not create a second Supabase project. It pauses when idle, so wake it before a demo.

Mirrored from [docs/specs/0001-stack-architecture/index.md](docs/specs/0001-stack-architecture/index.md),
which is the source of truth. `zod`, `undici` and Framer Motion are in that spec but not installed
yet; they arrive with the features that need them.

## Build approach

**Skateboard**: ship the smallest usable Sotus first, then grow it release by release, shippable at every step.

## Commands

```bash
# Install
pnpm install

# Dev server
pnpm dev

# Build
pnpm build

# Typecheck
pnpm typecheck

# Lint
pnpm lint

# UI class guard (banned shadcn patterns, see docs/design.md "After shadcn add")
pnpm check:ui

# Format (Prettier; `format:check` only reports)
pnpm format
pnpm format:check

# Database migrations (plain SQL in supabase/migrations/)
supabase db push

# Regenerate DB types after a migration
supabase gen types typescript --linked > src/lib/supabase/database.types.ts

# Prove the data model against sotus-dev (one rolled back transaction; run when today's attempt count is under 270)
supabase db query --linked -f supabase/tests/rls.sql

# Gemini YouTube feasibility spike (throwaway, needs .env.local)
pnpm spike:gemini-youtube
```

No test command: the Alpha tier proves each feature with `/check verify` instead.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`, with `rationale.md` and
`verify.md` beside it. The feature scope lives in [docs/scope/scope.md](docs/scope/scope.md).

## Rules

- **Functional and immutable.** Pure functions by default, `const` and `readonly` data, no shared mutable state, composition over inheritance, no classes where a function works. Side effects live at the edges: Server Actions, route handlers, the Supabase and Gemini clients.
- **Expected failures return a typed result, never a throw.** Every extraction ends in exactly one of `recipe`, `not_a_recipe`, `insufficient`, `ingestion_failed` (spec 0001's acceptance contract). An unexpected throw is caught at the Server Action edge and becomes `ingestion_failed`. Avoid `null`; use `undefined` in a union.
- **Server first.** Pages are Server Components. `"use client"` only for real interaction: forms with pending state, menus, motion.
- **Secrets and env vars.** `GEMINI_API_KEY` is read only in server code, behind `import "server-only"`. Only `NEXT_PUBLIC_` variables reach the browser. Every variable is validated where it is read and throws when absent, the way [src/lib/supabase/env.ts](src/lib/supabase/env.ts) does, so a missing secret fails at boot rather than mid extraction.
- **RLS is the security boundary.** Every table has row level security on, the app uses the publishable key plus the user's session, and no service role key. Server code identifies the user with `supabase.auth.getUser()` or `getClaims()`, never `getSession()` alone.
- **Recipes are written only through `save_recipe`.** The caller signs the payload with `RECIPE_PUBLISH_SECRET` via [src/lib/recipes/sign-payload.ts](src/lib/recipes/sign-payload.ts) (`server-only`); the database checks it against the Vault secret `recipe_publish_secret`. The two values must match. Attempts start with `reserve_ai_attempt`; the error texts map to typed results in [src/lib/ai/attempt-reasons.ts](src/lib/ai/attempt-reasons.ts).
- **One door for user supplied URLs.** Web page URLs go through `safeFetch` and nothing else fetches them. YouTube links take their own guarded path: parse the video id, rebuild the canonical `https://www.youtube.com/watch?v=<id>` URL, and send only that onward. The pasted URL is never fetched or forwarded.
- **Reserve before cost, save only what passed.** No fetch or Gemini call starts without a successful quota reservation, and only an accepted recipe is written, atomically. One `AbortSignal` carries the 75 s deadline to every step.
- **Named exports only.** Next.js route files are the exception: `page.tsx`, `layout.tsx`, `route.ts` and friends must default export.
- **Mobile first, WCAG AA.** Phone width is the design target. Sufficient contrast, visible focus, keyboard reachable, real labels, one `<h1>` per page, alt text on every image.
- Design system: build all UI to [docs/design.md](docs/design.md) (art direction and the product bar); token values live in `src/app/globals.css`.
- **`cn` comes from the `cn` package** (`shadcn-ui/cn`), re-exported by [src/lib/utils.ts](src/lib/utils.ts). It is the official drop in for `clsx` + `tailwind-merge`; do not swap it back.
- **Comments explain why, not what.** [src/lib/supabase/server.ts](src/lib/supabase/server.ts) sets the bar: a comment earns its place when the reason is not obvious from the code.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`.

## Tooling

Chosen during `/audit`, installed by the `/develop tooling` sub task. All of it is installed except
Vitest, which stays deferred.

- **TypeScript**: keep `strict`, and add `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`. Model output and record lookups are full of optional fields, so the index check pays for itself.
- **Lint and format**: ESLint with `eslint-config-next` (installed) plus Prettier with `prettier-plugin-tailwindcss` so class lists stay sorted.
- **Before a commit**: husky and lint-staged run ESLint and Prettier on staged files, `check:ui` on staged `.tsx` files, then `tsc --noEmit`.
- **Continuous integration**: none. Every push already gets a Vercel build and a preview URL, and that is the gate. Lint and format stay local, caught by the commit hook.
- **Tests**: none required at the Alpha tier; each feature is proved with `/check verify`. Vitest arrives only if a feature moves to Beta. The Gemini spike is a script, not a test.

## Git

- integration: on
- branch prefix: `feat/`
- commit: per-milestone
- Pushes and pull requests always ask first.

## Agent skills

Project skills, installed in `.claude/skills/` and locked in `skills-lock.json`:

- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance patterns; read before writing components or data fetching.
- [vercel-composition-patterns](.claude/skills/vercel-composition-patterns/): `vercel-labs/agent-skills`, component API design: compound components, render props, context providers.
- [next-dev-loop](.claude/skills/next-dev-loop/): `vercel/next.js`, prove a change works in the running app, not just that it compiles.
- [shadcn](.claude/skills/shadcn/): `shadcn-ui/ui`, adding, composing, styling and debugging shadcn/ui components.
- [deploy-to-vercel](.claude/skills/deploy-to-vercel/): `vercel-labs/agent-skills`, deploying and getting a preview or production URL.
- [vercel-cli-with-tokens](.claude/skills/vercel-cli-with-tokens/): `vercel-labs/agent-skills`, Vercel CLI with token auth, environment variables and project setup.

User level skills, in `~/.claude/skills/`:

- [supabase](~/.claude/skills/supabase/): `supabase`, anything Supabase: `@supabase/ssr` cookie flow, auth, RLS, migrations, the CLI.
- [supabase-postgres-best-practices](~/.claude/skills/supabase-postgres-best-practices/): `supabase`, Postgres query, schema and index design; read before writing a migration or an RPC function.

MCP servers: Vercel MCP (connected) · Next.js devtools MCP (built into the Next.js 16 dev server)

Declined: Tailwind v4 docs skills, zod community skills, shadcn community MCP, `vercel/ai@ai-sdk` (teaches the Vercel AI SDK, which this project does not use), Firecrawl skills, Google Agents CLI skills, accessibility and SSRF fetch MCP servers. Nothing credible exists for `@google/genai` or `undici`; spec 0001 carries those conventions instead.

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

- [src/components/AGENTS.md](src/components/AGENTS.md): the edited shadcn primitives in `ui/`, the app shell in `shell/`, and the rules for adding a component

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
