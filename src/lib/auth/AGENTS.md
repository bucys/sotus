# src/lib/auth

Google sign in, the auth guard and the sign in helpers. The contract is spec
[0005](../../../docs/specs/0005-sign-in/index.md); runtime checks live in its `verify.md`.

## Files

- `require-user.ts` (`server-only`): the one guard. `requireUser()` (cached per request, uses `getUser()`), `requirePageUser(nextPath)` for layouts, pages and data reads, `requireActionUser()` for mutating Server Actions.
- `actions.ts`: `signInWithGoogle` and `signOut` Server Actions.
- `safe-next-path.ts`: `safeNextPath`, the only way a `next` value is honoured; anything it rejects becomes `/`.
- `origin.ts`: `validateActionOrigin` (the return address for OAuth) and `signInPath` (builds `/sign-in?error=&next=`).
- `classify-auth-result.ts`: maps a Supabase answer to `signed_in`, `signed_out` or `unavailable`.
- `messages.ts`: the fixed user facing texts, error codes and `KNOWN_CANCELLATIONS`.
- `profile.ts`, `initials.ts`: the account menu name and avatar, with the `Sotus cook` / `S` fallback.

Routes and UI that use these: `src/app/(auth)/sign-in/`, `src/app/auth/callback/route.ts`, the private `src/app/(app)/` layout, `src/components/auth/`. The proxy gate is `src/lib/supabase/proxy.ts`.

## Rules

- **Every protected entry point calls the guard itself.** Pages and data reads use `requirePageUser()`; every mutating Server Action starts with `requireActionUser()` and returns its typed failure. The proxy and the `(app)` layout are navigation help only, never the guarantee.
- **Unavailable is never signed out.** A Supabase error or outage comes back as `unavailable` and renders `AuthUnavailable` (or `{ ok: false, reason: "unavailable" }`); it is never thrown, because `error.tsx` cannot tell it apart in production.
- **The proxy never redirects a signed in visit away from `/sign-in`**: `getClaims()` can pass for a revoked session, which loops with the layout. The sign in page does that redirect after `getUser()`.
- **Return address**: from the `Origin` header, accepted only when it matches the host. Never trust `x-forwarded-*`. The callback uses `request.url` plus `safeNextPath(next)`.
- **No provider text on screen.** Show only `messages.ts` texts. Add a pair to `KNOWN_CANCELLATIONS` only after seeing it in a real run; never guess one.
- **Check**: `pnpm check:auth` runs the helper table checks (`scripts/check-auth-helpers.mjs`) for `safeNextPath`, `classifyAuthResult` and the origin rules.

_Drafted by /sync from the introducing change, worth a quick human pass._
