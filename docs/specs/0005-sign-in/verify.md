# Verify: Sign in · spec 0005 · updated 2026-10-05
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Setup (engineer, before the UI steps)
- [ ] Google OAuth consent screen is published to production; Supabase Google provider is on; Email and Phone providers are off; Site URL and redirect allow list (production, `http://localhost:3000/**`, preview pattern) are set → AC-9, AC-10

## UI / manual
- [ ] Phone width (320px), signed out: open `/` → redirected to `/sign-in`, one `<h1>`, one "Continue with Google" button, visible focus, no horizontal scroll → AC-1, AC-11
- [ ] Signed out: open `/recipes/abc?x=1` → `/sign-in?next=%2Frecipes%2Fabc%3Fx%3D1`; view source shows no app content → AC-2
- [ ] Tap Continue with Google, approve → land on the deep link with the avatar in the header; first ever account also has a `profiles` row → AC-1, AC-4, AC-5
- [ ] Cancel at Google, then deny consent: note the exact `error` and `error_code` in the callback URL, add the pair to `KNOWN_CANCELLATIONS`, confirm the cancelled message; retry → land on the original deep link → AC-7
- [ ] Force a callback failure (open `/auth/callback?next=/recipes/abc` with no code) → `/sign-in?error=failed&next=...` with the generic message, never provider text → AC-7
- [ ] Signed in, open `/sign-in?next=/recipes/abc` → redirected to `/recipes/abc` → AC-4
- [ ] Avatar button is 44px, Tab reaches it, label reads "Account menu, <name>", Escape closes the menu, broken photo URL falls back to initials, deleted profile row shows "Sotus cook" / "S" → AC-5
- [ ] Sign out → `/sign-in`; browser back and reload both land on `/sign-in`; a second signed in device stays signed in → AC-6
- [ ] Block the sign out request (offline) → person stays signed in, sees the retry message and Try again works → AC-6
- [ ] Repeat the happy path on `http://localhost:3000` and on a Vercel preview URL, with a query inside `next`; confirm the Origin and `request.url` rules hold behind Vercel → AC-9
- [ ] Outage drill (pause `sotus-dev` or block its host): signed in cookies stay, a guarded page shows "Sotus cannot check your sign in" with Try again, the callback shows the unavailable message with `next` kept → AC-12
- [ ] A signed out client with the proxy skipped (render a protected page directly) is still redirected by `requirePageUser()` → AC-8

## Commands
- [ ] `pnpm check:auth` → prints "auth helper checks passed" (safeNextPath table, classifyAuthResult, origin rules) → AC-3, AC-12
- [ ] `pnpm typecheck && pnpm lint && pnpm check:ui && pnpm build` → all green → AC-11
- [ ] `curl -sI http://localhost:3000/` → 307 with `location: /sign-in` → AC-2
- [ ] `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/` → not redirected by the proxy (any redirect here comes from the page's own `requirePageUser()`) → AC-2, AC-8
- [ ] Browser console with the public key: `signUp`, `signInWithPassword`, `signInWithOtp`, phone sign in and `signInAnonymously` all return errors → AC-10
- [ ] Call a mutating Server Action with no session → `{ ok: false, reason: "signed_out" }`, nothing changed (arrives with the first mutating action, #6) → AC-8

## Value sourcing
- [ ] `redirectTo` is `<origin>/auth/callback?next=<encoded>`: vary the host (localhost, preview) and a hostile `Origin` header → hostile Origin goes to `/sign-in?error=failed` → AC-9
- [ ] Callback final redirect uses the request origin plus `safeNextPath(next)`: try `next=//evil.com`, `next=/x/../sign-in` → lands on `/` → AC-3
- [ ] Proxy `next` drops `_rsc` and caps at 2048 characters → AC-2, AC-3
- [ ] Error code source: a real cancel and a real deny map as recorded; any other provider error shows the generic message → AC-7
- [ ] Account menu name and avatar come from the `profiles` row for the verified user id; missing row falls back → AC-5

## Acceptance-criteria coverage
- AC-1 … covered by setup, UI steps 1 and 3 · AC-2 … steps 2, curl steps · AC-3 … `pnpm check:auth`, value sourcing · AC-4 … steps 3, 6 · AC-5 … steps 3, 7 · AC-6 … steps 8, 9 · AC-7 … steps 4, 5 · AC-8 … skipped proxy step, action step · AC-9 … setup, origins step · AC-10 … setup, console step · AC-11 … step 1, build step · AC-12 … outage step, `pnpm check:auth`
