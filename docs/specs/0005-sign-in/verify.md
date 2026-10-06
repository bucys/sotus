# Verify: Sign in · spec 0005 · updated 2026-10-06
_**Alpha verdict 2026-10-06: PASS.** Every Alpha critical path has runtime evidence (Google sign in to a deep link with a profile row, the signed out gate, sign out, the origin rules on localhost and production). Nothing failed. Unticked steps below are deferred or partly checked, each with a note. Two small checks were not run and are worth a minute before a demo: signed in `/sign-in?next=/recipes/abc`, and back plus reload after sign out._
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Setup (engineer, before the UI steps)
- [ ] Google OAuth consent screen is published to production; Supabase Google provider is on; Email and Phone providers are off; Site URL and redirect allow list (production, `http://localhost:3000/**`, preview pattern) are set → AC-9, AC-10
  - _2026-10-06, /check verify: production Google sign in works (engineer), Email, Phone and anonymous sign in are rejected (console step), and both localhost and production build their own Supabase authorize URL. The preview pattern in the allow list is unconfirmed; deferred for Alpha with the preview round trip._

## UI / manual
- [ ] Phone width (320px), signed out: open `/` → redirected to `/sign-in`, one `<h1>`, one "Continue with Google" button, visible focus, no horizontal scroll → AC-1, AC-11
  - _2026-10-06, /check verify: `curl /sign-in` on localhost and production shows one `<h1>`, one "Continue with Google" button and `robots noindex, nofollow`; signed out `GET /` → 307 `/sign-in` on production. The 320px visual pass (focus outline, no horizontal scroll, contrast) was not driven in a browser; deferred for Alpha under the accessibility policy._
- [x] Signed out: open `/recipes/abc?x=1` → `/sign-in?next=%2Frecipes%2Fabc%3Fx%3D1`; view source shows no app content → AC-2
- [x] Tap Continue with Google, approve → land on the deep link with the avatar in the header; first ever account also has a `profiles` row → AC-1, AC-4, AC-5
  - _2026-10-06, production, engineer: real Google sign in from `/recipes/test?x=1` came back to `/recipes/test?x=1` (it 404s because the route is not built yet, which is expected). The `profiles` row was created._
- [ ] _Deferred, does not block Alpha:_ Cancel at Google, then deny consent: note the exact `error` and `error_code` in the callback URL, add the pair to `KNOWN_CANCELLATIONS`, confirm the cancelled message; retry → land on the original deep link → AC-7
  - _2026-10-06, production, engineer: not exercised, because the Google flow showed no cancel or back path. `KNOWN_CANCELLATIONS` stays empty until a real provider pair is seen; do not guess one. Until then every provider error shows the generic message, which is the safe default._
- [x] Force a callback failure (open `/auth/callback?next=/recipes/abc` with no code) → `/sign-in?error=failed&next=...` with the generic message, never provider text → AC-7
- [ ] Signed in, open `/sign-in?next=/recipes/abc` → redirected to `/recipes/abc` → AC-4
  - _2026-10-06, production, engineer: signed in `/sign-in` (no `next`) redirected to `/`. The case with `next` still needs a run._
- [ ] Avatar button is 44px, Tab reaches it, label reads "Account menu, <name>", Escape closes the menu, broken photo URL falls back to initials, deleted profile row shows "Sotus cook" / "S" → AC-5
  - _2026-10-06, production, engineer: the account menu opens, Escape closes it, and keyboard navigation works across the site and header. Still to check: the 44px size, the exact label, the broken photo fallback and the missing profile fallback._
- [ ] Sign out → `/sign-in`; browser back and reload both land on `/sign-in`; a second signed in device stays signed in → AC-6
  - _2026-10-06, production, engineer: sign out works. Still to check: back and reload after sign out, and a second device._
- [ ] _Deferred, does not block Alpha:_ Block the sign out request (offline) → person stays signed in, sees the retry message and Try again works → AC-6
- [ ] _Deferred, does not block Alpha:_ Repeat the happy path on `http://localhost:3000` and on a Vercel preview URL, with a query inside `next`; confirm the Origin and `request.url` rules hold behind Vercel → AC-9
  - _2026-10-06, /check verify: production round trip works (engineer). Production's sign in action builds `redirect_to=https://sotus.vercel.app/auth/callback?next=...`, so the origin rules hold behind Vercel. Preview round trip deferred._
- [ ] _Deferred, does not block Alpha:_ Outage drill (pause `sotus-dev` or block its host): signed in cookies stay, a guarded page shows "Sotus cannot check your sign in" with Try again, the callback shows the unavailable message with `next` kept → AC-12
- [x] A signed out client with the proxy skipped (render a protected page directly) is still redirected by `requirePageUser()` → AC-8

- [ ] _Deferred, does not block Alpha:_ Throw a temporary error from an `(app)` page in a production build → "Something went wrong" screen, never "Sotus cannot check your sign in" → AC-12

## Commands
- [x] `pnpm check:auth` → prints "auth helper checks passed" (safeNextPath table, classifyAuthResult, origin rules) → AC-3, AC-12
- [x] `pnpm typecheck && pnpm lint && pnpm check:ui && pnpm build` → all green → AC-11
- [x] `curl -sI http://localhost:3000/` → 307 with `location: /sign-in` → AC-2
- [x] `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/` → not redirected by the proxy (any redirect here comes from the page's own `requirePageUser()`) → AC-2, AC-8
- [x] Browser console with the public key: `signUp`, `signInWithPassword`, `signInWithOtp`, phone sign in and `signInAnonymously` all return errors → AC-10
- [ ] _Carried to feature #6:_ Call a mutating Server Action with no session → `{ ok: false, reason: "signed_out" }`, nothing changed (arrives with the first mutating action, #6) → AC-8

## Value sourcing
- [x] `redirectTo` is `<origin>/auth/callback?next=<encoded>`: vary the host (localhost, preview) → each host builds its own callback URL → AC-9
  - _2026-10-06, /check verify: POST to the sign in action → 303 to Supabase authorize with `redirect_to` of `http://localhost:3000/...`, `http://127.0.0.1:3000/...` and `https://sotus.vercel.app/auth/callback?next=%252Frecipes%252Fabc%253Fx%253D1` for each host. Preview host deferred._
- [x] Hostile `Origin` header on the sign in Server Action (an `Origin` that does not match the host) → Next.js 16 Server Action protection rejects it before the app action runs. A `500` with "Invalid Server Actions request" is a pass. Also confirm no OAuth flow starts (no redirect to Google or Supabase) and no `redirectTo` with the attacker's origin is produced → AC-9
  - _2026-10-06, /check verify: `Origin: https://evil.example` → 500, no `Location` header, body has no Supabase URL and no `evil.example`. Localhost body reads "Invalid Server Actions request."; production returns an empty 500. Pass._
- [x] Missing `Origin` header on the same action → it reaches the app's own fallback and redirects safely to `/sign-in?error=failed` → AC-9
  - _2026-10-06, /check verify: localhost and production both → 303 `/sign-in?error=failed&next=%2Frecipes%2Fabc%3Fx%3D1`, no OAuth flow started._
- [x] Callback final redirect uses the request origin plus `safeNextPath(next)`: try `next=//evil.com`, `next=/x/../sign-in` → lands on `/` → AC-3
  - _2026-10-06, /check verify: `/auth/callback` with `next` of `//evil.com`, `/x/../sign-in`, `https://evil.com` and `/auth/callback` → 307 `http://localhost:3000/sign-in?error=failed` with the bad `next` dropped (falls back to `/`). A valid `next=/recipes/abc` is kept. The success branch uses the same `safeNextPath`, proved by `pnpm check:auth` (re-run, passed)._
- [x] Proxy `next` drops `_rsc` and caps at 2048 characters → AC-2, AC-3
- [ ] _Deferred, does not block Alpha:_ Error code source: a real cancel and a real deny map as recorded; any other provider error shows the generic message → AC-7
- [ ] Account menu name and avatar come from the `profiles` row for the verified user id; missing row falls back → AC-5

## Acceptance-criteria coverage
- AC-1 … covered by setup, UI steps 1 and 3 · AC-2 … steps 2, curl steps · AC-3 … `pnpm check:auth`, value sourcing · AC-4 … steps 3, 6 · AC-5 … steps 3, 7 · AC-6 … steps 8, 9 · AC-7 … steps 4, 5 · AC-8 … skipped proxy step, action step · AC-9 … setup, origins step · AC-10 … setup, console step · AC-11 … step 1, build step · AC-12 … outage step, `pnpm check:auth`
