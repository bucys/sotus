# Sotus

Turn a cooking video or recipe link into a clean, reusable recipe, keep it in a
shared library and your own collection, and answer "what should I cook today?"

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · shadcn/ui on
Radix · Supabase (Postgres, Auth, RLS) · Google Gemini Flash · deployed on Vercel.

The full decision and its reasoning: [`docs/specs/0001-stack-architecture/`](docs/specs/0001-stack-architecture/index.md).
What is built and what is next: [`docs/scope/scope.md`](docs/scope/scope.md).

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev
```

| Script                      | What it does                            |
| --------------------------- | --------------------------------------- |
| `pnpm dev`                  | Dev server on http://localhost:3000     |
| `pnpm build`                | Production build                        |
| `pnpm typecheck`            | TypeScript, no emit                     |
| `pnpm lint`                 | ESLint                                  |
| `pnpm spike:gemini-youtube` | One off feasibility spike for spec 0001 |

## Layout

```
src/app/            routes
src/components/     shared UI (components/ui/ holds shadcn/ui)
src/lib/supabase/   browser and server clients, session proxy helper, generated types
src/proxy.ts        session refresh on every request
supabase/migrations/ SQL migrations, applied with the Supabase CLI
scripts/            throwaway spikes
```

Durable product background lives in the Vault at `AI_VAULT/02-Projects/Sotus/`.
<<<<<<< Updated upstream
=======

> > > > > > > Stashed changes
