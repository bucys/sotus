# 0005. Sign in: Google only, with a private app behind it

**Date**: 2026-10-05
**Status**: Accepted

## Summary

People sign in to Sotus with one tap on "Continue with Google". Everything else in the app is private: a signed out visitor is sent to the sign in page and, after signing in, lands back where they were headed. Signed in people get an avatar button in the header with a Sign out item. There is no password, no email sending and no account deletion in this version. Signing in for the first time is also signing up, because the database already creates the profile for a new account (spec 0003). Every protected server entry point (page, data read, Server Action) checks the user itself with one shared `requireUser()`; the proxy and the layout only make navigation pleasant.

## Requirements

**User stories**:
- As a visitor, I want to sign in with my Google account in one tap so that I do not manage another password.
- As a signed out visitor following a link to a recipe, I want to land on that recipe after signing in, even if my first attempt fails, so that the link still works.
- As a signed in person, I want to sign out from my phone so that someone else using it cannot see or change my collection.
- As the app owner, I want signed out visitors and non Google sign ups blocked at every server entry point so that only real Google accounts reach the library and the AI quota.

**Acceptance criteria**:
- **AC-1**: The sign in page shows the wordmark, one line of purpose and one "Continue with Google" button. Tapping it goes to Google; after approval the person is back in Sotus signed in. A first time sign in creates the account and its profile (spec 0003 AC-12), so there is no separate sign up step.
- **AC-2**: A verified signed out GET or HEAD navigation to any page except `/sign-in` and `/auth/callback` is redirected to `/sign-in?next=<original path and query>`, with no app content in the response. The proxy never redirects other methods (a mutation POST is not replayed to another URL); those reach their own entry point, which authenticates itself (AC-8).
- **AC-3**: `next` is honoured only when `safeNextPath` accepts it (algorithm in Feature design): a same site path, validated both before and after URL normalization, never `/sign-in` or `/auth/...`, never protocol relative or external, at most 2048 characters. Anything else becomes `/`.
- **AC-4**: After a successful sign in the person lands on the validated `next` path, else `/`. A signed in person who opens `/sign-in` with a GET is redirected the same way.
- **AC-5**: Signed in pages show an avatar button in the header (Google photo, or initials when there is none or it fails to load). It opens a menu with the display name and a Sign out item. It is a 44px target, reachable by keyboard, announced as "Account menu, <display name>", and the menu closes with Escape. A missing profile row shows "Sotus cook" and initials "S"; the menu never fails because of it.
- **AC-6**: Sign out ends the session on this device only and lands on `/sign-in`. Pressing back or reloading a protected page afterwards redirects to `/sign-in` again. Other devices stay signed in. If sign out itself fails, the person stays signed in and sees a problem message with a retry (the app never claims a sign out that did not happen).
- **AC-7**: A validated `next` survives every failure and retry. If the OAuth start fails, the person cancels at Google, or the callback fails, they land on `/sign-in?error=<code>&next=<validated next>` with one fixed problem message, the button still works, and a later successful sign in lands on the original deep link. Only known cancellation cases show the cancelled message; every other provider or auth failure shows the generic one. No provider error text is ever shown.
- **AC-8**: Every protected server entry point authenticates itself with the request scoped `requireUser()`: pages and data reads that render private data, and every mutating Server Action. A mutating action called without a verified user returns `{ ok: false, reason: "signed_out" }` and changes nothing, even if the proxy was skipped. The proxy and the `(app)` layout are navigation and session refresh help, not the guarantee. Row level security remains the final data authorization boundary.
- **AC-9**: Sign in works from `http://localhost:3000`, a Vercel preview URL and the production URL against the one Supabase project, because the return address comes from a validated request origin (rules in Feature design).
- **AC-10**: Email and password sign up is closed. `supabase.auth.signUp`, `signInWithPassword`, `signInWithOtp` and phone sign in with the public key all fail, and anonymous sign ins are off.
- **AC-11**: The sign in page works at 320px wide, has one `<h1>`, a visible focus outline, a real button label, and passes WCAG AA contrast. `/sign-in` is marked `noindex`. The Google code never stays in the address bar after the callback.
- **AC-12**: An unreachable or erroring Supabase is never treated as signed out. Existing auth cookies are kept; the proxy passes the request through unchanged; a guarded layout or page renders the auth unavailable screen itself (an explicit typed state, never a thrown error), and an unrelated render error shows the normal app error screen, never the auth message; a mutating action returns `{ ok: false, reason: "unavailable" }`; a callback exchange that fails for that reason shows the unavailable message with `next` kept.

## Decision

**Chosen option**: Option 1: Google only, Supabase Auth, Server Action starts the flow.

Sign in uses `signInWithOAuth({ provider: "google" })` from a Server Action, `/auth/callback` finishes the PKCE exchange, and `next` travels as query state. Authorization is layered: the proxy and the `(app)` layout are navigation help, `requireUser()` is the guarantee at every protected server entry point, and RLS is the final data boundary. Sign out ends only this device's session.

**Implementation skills**: `supabase` (`supabase/supabase`, `~/.claude/skills/supabase/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

Next.js 16 differs from older versions, so read the matching guides in `node_modules/next/dist/docs/` (proxy, Server Actions, route groups, redirects, error files) before writing code.

## Feature design

**Data model sketch**: no new tables or migrations. Uses `auth.users` (Supabase) and `profiles(id, display_name, avatar_url)` with its trigger from spec 0003. The trigger runs in the same transaction as the `auth.users` insert, so a brand new account has its profile by the time the code exchange returns. The row can still be missing for an account deleted mid session or a failed backfill, so anything that reads it must tolerate a missing row. The app never stores tokens or emails itself.

**State transitions**: signed out → (Google approval + code exchange) → signed in → (Sign out, this device) → signed out. A failed or cancelled approval stays signed out and shows a message. A failed or unreachable check is a third, "indeterminate" outcome that changes nothing.

**Auth boundary model** (final):
| Layer | Role | Signed out | Indeterminate (Supabase unreachable) |
|---|---|---|---|
| `src/proxy.ts` | Session refresh and navigation help; not a guarantee | GET/HEAD: redirect to `/sign-in?next=...`. Other methods: pass through | Pass the request through unchanged; write no cookies |
| `(app)` layout | Loads the profile for the header; checks `requireUser()` | Redirect to `/sign-in` without `next` (a layout cannot know the path) | Render `AuthUnavailable` in place of its children (inside `AppShell`, no account menu); children never render |
| Page or data read | Calls `requireUser()` when it renders private data; may pass its own path as `next` | Redirect to `/sign-in?next=<own path>` | Return the `unavailable` result; the page renders `AuthUnavailable` itself |
| Mutating Server Action | Calls `requireUser()` first | Return `{ ok: false, reason: "signed_out" }`, no redirect | Return `{ ok: false, reason: "unavailable" }` |
| Row level security | Final data authorization | Denies | Denies |

`requireUser()` lives in `src/lib/auth/require-user.ts` (`server-only`, wrapped in React `cache`). It calls `supabase.auth.getUser()` and returns `{ status: "signed_in", userId } | { status: "signed_out" } | { status: "unavailable" }`. `requirePageUser(nextPath?)` wraps it for layouts and pages: signed out redirects, signed in returns `{ status: "signed_in", userId }`, unavailable returns `{ status: "unavailable" }` for the caller to render `AuthUnavailable`. Actions use `requireActionUser()`. Nothing throws for the unavailable state: an expected failure is a typed result (AGENTS.md), and a thrown error cannot be told apart in `error.tsx` in production, because Next replaces the message and keeps no custom error name. `AuthUnavailableError` is removed. `(app)/error.tsx` is a normal app error screen (generic copy below) and never mentions sign in. A page that skips the layout check (soft navigation does not re-run a layout) must do its own `requirePageUser()` and render `AuthUnavailable` the same way.

Classification is one pure function, `classifyAuthResult({ user, error })`, used by the proxy, `requireUser()` and the callback:
- a user and no error → signed in
- no user and no error, or a missing session, or a 4xx auth error (invalid or revoked refresh token) → signed out
- a network error, a retryable fetch error or a 5xx → unavailable
- anything unrecognized → unavailable (fail safe: do not sign people out on a guess)

The exact `@supabase/supabase-js` error classes and status fields are read from the installed version at build time, and the function gets a table driven check script like `safeNextPath`.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/sign-in` (page, dynamic) | GET | `next?`, `error?` (query) | Sign in screen; fixed message for a known `error` code; `next` carried in the hidden field | public | unknown `error` code shows the `failed` message |
| `signInWithGoogle` (Server Action, `src/lib/auth/actions.ts`) | POST form | `next` (hidden field, optional) | Redirect to Google's URL, or to `/sign-in?error=<code>&next=<safe next>` | public | invalid or missing Origin → `failed`; no URL from Supabase → `failed`; unreachable → `unavailable` |
| `/auth/callback` (Route Handler) | GET | `code`, `next?`, `error?`, `error_code?` | Redirect to validated `next` or `/`, with session cookies | public | provider error → `cancelled` or `failed`; exchange error → `failed` or `unavailable`; no `code` → `failed` |
| `signOut` (Server Action) | POST form | none | Ends this device's session, redirect to `/sign-in` | signed in | Supabase error → `{ ok: false, reason: "failed" }`, person stays signed in with a retry message |
| `src/proxy.ts` gate | GET, HEAD only for redirects | request cookies | Pass through with refreshed cookies, or redirect (see boundary table) | n/a | indeterminate → pass through unchanged |

**OAuth next and error flow** (final):
1. A protected GET reaches the proxy while verified signed out. It builds `next` from `pathname + search`, removing `_rsc`, then runs `safeNextPath` (over 2048 characters becomes `/`), and redirects to `/sign-in?next=<encoded next>`.
2. The sign in page re-validates `next` and puts it in the form's hidden field. A signed in GET to `/sign-in` redirects to the validated `next`.
3. `signInWithGoogle` validates the Origin (rules below), validates `next`, then calls `signInWithOAuth` with `redirectTo = <origin>/auth/callback?next=<encoded safe next>` and redirects to the returned URL. On any failure it redirects to `/sign-in?error=<code>&next=<safe next>`.
4. The callback reads `next` from its own URL and validates it again. A provider `error`, or a missing `code`, goes to `/sign-in?error=<code>&next=<safe next>`.
5. With a `code`, it calls `exchangeCodeForSession`. Success redirects to `<request origin><safe next>`. Failure classifies: unreachable → `unavailable`, else `failed`; both go to `/sign-in?error=<code>&next=<safe next>`.
6. On the sign in page the person taps the button again; step 3 repeats with the same `next`. Success ends at the original deep link.
- If the allow list rejects `redirectTo`, Supabase sends the person to the Site URL with the code and `next` is lost. That is a setup error and a verify step, not something the app compensates for.
- Two tabs or a double tap start two flows; the second overwrites the PKCE verifier cookie, so the first tab's exchange fails with `failed` and the person retries. The pending state disables the button after the first tap.

**Error codes**: `type AuthErrorCode = "cancelled" | "failed" | "unavailable"`, a closed set. A code in the URL is this feature's typed result; unknown codes render as `failed`. Classification of a provider error:
- `cancelled` only when the pair `error` + `error_code` matches an entry in `KNOWN_CANCELLATIONS` (a small constant in `messages.ts`). The list starts from what the build captures from real runs (cancel on the Google screen, deny consent) and is recorded in the verify evidence. Until a case has been observed it is not on the list.
- every other provider or auth error → `failed`.
- `error_description` and any other provider text is ignored and never shown or logged.

**Exact copy** (all in `src/lib/auth/messages.ts`; one problem `Alert` announces it, per the design rules):
- Wordmark: "Sotus"
- Purpose line: "Turn cooking videos and recipe links into clean recipes you can cook from."
- Button: "Continue with Google"; while pending: "Opening Google"
- `cancelled`: "Sign in was cancelled. You can try again when you are ready."
- `failed`: "We could not sign you in. Please try again."
- `unavailable`: "Sotus cannot reach sign in right now. Please try again in a moment."
- In app browser hint (always visible, no user agent sniffing): "Google not loading? Open Sotus in Safari or Chrome."
- Sign out retry: "We could not sign you out. Please try again."
- `AuthUnavailable` screen (a shared component in `src/components/auth/`, `Alert tone="problem" announce="assertive"` plus a `secondary` Try again button that takes focus and calls `router.refresh()`): "Sotus cannot check your sign in" with "Please try again in a moment."
- Normal app error screen (`(app)/error.tsx`, the standard shape from `docs/design.md`, `reset` retry): "Something went wrong" with "Please try again."

**`safeNextPath` algorithm** (pure, `src/lib/auth/safe-next-path.ts`, `(input: unknown) => string`, default `/`):
1. Before parsing, on the raw value: it must be a string (arrays and undefined fail), at most 2048 characters, start with `/`, not start with `//`, contain no backslash and no control character (U+0000 to U+001F, U+007F).
2. Parse: `const url = new URL(raw, "http://sotus.invalid")`. Require `url.origin === "http://sotus.invalid"`. A throw means reject.
3. After normalization, on `url.pathname`: it must start with `/` and not start with `//` (this catches `/a/..//evil.example`, which normalizes to `//evil.example`); it must contain no backslash.
4. Auth path check on the normalized pathname, lowercased, trailing slashes removed, and also on its once decoded form (a decode error rejects): reject `/sign-in`, `/sign-in/...`, `/auth`, `/auth/...`. This catches `/x/../sign-in` and `/%2e%2e/sign-in`.
5. Build `result = url.pathname + url.search + url.hash`. Re-run the step 1 start checks and the step 2 origin check on `result`. Any failure returns `/`.
6. Return `result`.
It is called in the proxy, the sign in page, both actions and the callback; the callback's redirect target is always `<origin>` plus its output.

Table driven check (a script in `scripts/`, run with Node 24 type stripping, no new dependency; confirm at build):
| Input | Expected |
|---|---|
| `/x/../sign-in` | `/` |
| `/%2e%2e/sign-in` | `/` |
| `/a/..//evil.example` | `/` |
| `//evil.example` | `/` |
| `https://evil.example` | `/` |
| `/\evil.example`, `/a\b` | `/` |
| `/\t/evil.com`, any control character | `/` |
| a 2049 character path | `/` |
| `/SIGN-IN/`, `/auth/callback` | `/` |
| `undefined`, an array | `/` |
| `/recipes/abc?x=1` | `/recipes/abc?x=1` |
| `/recipes/abc?x=1#top` | `/recipes/abc?x=1#top` |

**Origin handling** (the two entry points differ):
- **Callback (has a Request)**: origin is `new URL(request.url).origin`. The final redirect uses the same origin. `x-forwarded-*` headers are not parsed.
- **Server Action (no Request)**: use the `Origin` header from `headers()`. Parse it with `new URL`; accept it only when the protocol is `http` or `https` and its host equals the request's `host` header. Missing, unparsable or mismatched Origin means no OAuth start: redirect to `/sign-in?error=failed&next=<safe next>`. Next.js already rejects cross origin Server Action posts, so this is a second, local check. No new env var and no `x-forwarded-*` trust.
- The Supabase redirect allow list is the last guard on any address. Verify both rules on a real Vercel preview (`host` and `request.url` behind Vercel's proxy), not only on localhost.

**Response preservation** (one helper, `copyAuthResponseState(from, to)`, `src/lib/supabase/`): when a proxy or callback response is replaced by a redirect, the new response must carry what Supabase set on the original.
- Cookies: copy every cookie from `from.cookies.getAll()` to `to.cookies.set(cookie)`, keeping each cookie's own options (path, maxAge, expires, httpOnly, secure, sameSite).
- Headers: copy `Cache-Control`, `Expires` and `Pragma` from `from` to `to` when `from` has them (the `setAll` callback receives these from `@supabase/ssr` so a CDN does not cache a response that carries a Set-Cookie). When a redirect carries cookies and none was supplied, set `Cache-Control: private, no-store`.
- Proxy: `updateSession` returns `{ response, outcome }`. The redirect rules build the redirect, call `copyAuthResponseState(response, redirect)`, and return that.
- `/auth/callback`: the handler creates its server client with an explicit adapter that writes cookies and headers onto a response object (not only `next/headers`). The success redirect and every failure redirect (`/sign-in?error=...`) are built through the same helper, so the session cookies, verifier cookie removal and cache headers are preserved on whichever redirect is returned.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Sign in action | Return address `redirectTo` | `<validated origin>/auth/callback?next=<encoded safe next>`; origin rules above |
| Sign in action | `next` | Hidden form field from the page's `next` query value, validated by `safeNextPath` |
| Callback | Final redirect target | `new URL(request.url).origin` plus `safeNextPath(next)` |
| Callback / action failure | Error code | Provider `error` + `error_code` checked against `KNOWN_CANCELLATIONS`, else `failed`; exchange failure via `classifyAuthResult`; unreachable → `unavailable` |
| Proxy redirect | `next` | The blocked GET's `pathname + search` without `_rsc`, then `safeNextPath` |
| Proxy, `requireUser()` | Signed in, signed out or unavailable | `classifyAuthResult` over the `getClaims()` (proxy) or `getUser()` (`requireUser()`) outcome |
| Account menu | Display name, avatar URL | `profiles` row where `id` = `userId` from `requireUser()`; missing row or query error → "Sotus cook" and no avatar |
| Account menu | Initials fallback | Split the display name on whitespace, first grapheme (`Array.from`) of up to two words, upper cased with `toLocaleUpperCase`; one word gives one letter; empty gives "S" |
| Sign in page | Message text | Fixed map from `error` code in `messages.ts`; unknown code → `failed` |

**Avatar contract**: Radix `AvatarImage` (a plain `<img>`, so the initials fallback runs on a load error) with `referrerPolicy="no-referrer"` and `alt=""`; the trigger button carries "Account menu, <display name>". No `next/image`, so `lh3.googleusercontent.com` needs no `remotePatterns` entry.

**Menu and sign out structure**: the sign out `<form>` (its `signOut` Server Action, with `useActionState` for the failure message) is rendered outside the menu content; the menu item is `<button type="submit" form="sign-out-form">` through `asChild`, so closing the menu on select does not unmount the form before it submits. Sign out calls `supabase.auth.signOut({ scope: "local" })`; on an error it returns `{ ok: false, reason: "failed" }` and the person stays signed in with the retry message. No manual cookie deletion and no blanket `revalidatePath` are added now; if the AC-6 verify shows a stale page after back or reload, add `revalidatePath("/", "layout")` then (see Follow-up).

**Key invariants**:
- Every protected server entry point calls `requireUser()` itself; no code treats "the proxy ran" or "the layout ran" as proof of a user.
- Server code identifies the user with `getUser()` or `getClaims()`, never `getSession()` alone (AGENTS.md).
- Auth unavailable is a typed state rendered explicitly by the guarded layout or page; `error.tsx` is never used for it, so no unrelated error is labelled as an auth failure.
- Indeterminate is never signed out: no redirect, no cookie write, no sign in bounce on an outage.
- The proxy redirects only GET and HEAD navigations.
- `next` is always a same site path after `safeNextPath`, validated at every read and again before every redirect.
- Session cookies are only written through the `@supabase/ssr` clients; any redirect that replaces a response goes through `copyAuthResponseState`.
- No provider error text is shown or logged. Every origin the app runs on is in the Supabase redirect allow list.
- Later features may assume a verified user from `requireUser()`; they must not assume a profile row exists, so profile dependent UI tolerates a missing row.

**Security model**:
- Identity comes only from Google through Supabase. There is no password, so there is nothing to brute force or reset. Supabase's own auth rate limits cover the rest; no app side rate limit is added.
- The Email provider, phone sign in and anonymous sign ins are disabled in the Supabase dashboard (AC-10). Without that, the public key allows direct sign up.
- PKCE protects the code exchange; the verifier cookie is set by the Server Action. Server Actions refuse cross origin posts, which blocks forged sign out requests. A mutation never relies on the proxy.
- Open redirect is blocked by `safeNextPath` and by the Supabase allow list.
- Personal data: Supabase holds the Google email, name and photo URL in `auth.users`. `profiles` holds only name and avatar URL. No special compliance scope beyond ordinary account data (Frankfurt region); a privacy notice and account deletion are follow ups.
- No tokens or codes are logged. The Google client secret lives in the Supabase dashboard only, never in the repo or env files.
- Known limit: Google blocks OAuth inside some in app browsers with its own error page, which never reaches Sotus. The always visible hint line covers it.

**Configuration required**: no new environment variables. One time setup before coding (done by the engineer, in dashboards):
- Google Cloud: OAuth consent screen, type External, app name Sotus, scopes `openid`, `email`, `profile` only, **published to production** (basic scopes need no Google review). One OAuth client of type Web with the authorised redirect URI `https://<sotus-dev project ref>.supabase.co/auth/v1/callback`.
- Supabase `sotus-dev` → Authentication: enable the Google provider with that client ID and secret; **disable the Email provider and the Phone provider**; keep anonymous sign ins off; set Site URL to the production URL.
- Redirect allow list: the production URL `/**`, `http://localhost:3000/**`, and the preview pattern `https://*-<vercel team slug>.vercel.app/**`. The preview pattern matches every project on that team, which is acceptable with one project and should be narrowed if the team gains others. The `/**` form must also match a `?next=` query; check it in the verify run.
- `.env.example` is unchanged.

**Critical test scenarios**:
- Happy path: signed out on a phone, open a recipe link, get sent to `/sign-in?next=...`, tap Continue with Google, approve, land on that recipe with the avatar showing. Verifies AC-1, AC-2, AC-4, AC-5.
- Deep link survives failure: deep link → sent to sign in → cancel at Google (or force a callback failure) → land on `/sign-in?error=...&next=...` → retry → approve → land on the original deep link. Also with the allow list, on a preview URL with a query inside `next`. Verifies AC-7, AC-9.
- Error classification: a real cancel at Google and a real deny are captured, recorded in the verify evidence and put in `KNOWN_CANCELLATIONS`; any other provider error shows the generic message and never `error_description`. Verifies AC-7.
- `safeNextPath` table above passes, including `/x/../sign-in`, `/a/..//evil.example`, `//evil.example`, `https://evil.example`, backslashes, control characters, an oversized value and a valid path with a query. Verifies AC-3.
- Sign out: sign out, press back and reload; both redirect to `/sign-in`; a second signed in device is unaffected; a forced sign out failure keeps the person signed in with the retry message. Verifies AC-6.
- Closed sign up: `signUp`, `signInWithPassword`, `signInWithOtp` and phone sign in from a console fail. Verifies AC-10.
- Auth boundary: a mutating Server Action called with no session returns `signed_out` and changes nothing; a protected page rendered without the proxy redirects; a non GET request from a signed out client is not redirected by the proxy. Verifies AC-2, AC-8.
- Outage: simulate Supabase unreachable (block its host in the dev server or pause the project). Signed in cookies stay, the proxy passes through, a guarded page shows the unavailable screen, an action returns `unavailable`, the callback shows the unavailable message. Verifies AC-12.
- Unrelated error: throw a temporary error from a page inside `(app)` in a production build. It shows "Something went wrong", never the sign in message. Verifies AC-12.
- Redirect cookies: a redirect produced by the proxy and by the callback still sets the refreshed cookies and carries the supplied cache headers. Verifies AC-2, AC-4.
- Origins: repeat the happy path on localhost and on a Vercel preview URL, and confirm the Origin and `request.url` rules there. Verifies AC-9.

## Build plan

Approach: Skateboard (scope default). First a thin, usable whole (sign in, private app, sign out), then the hardening. No migration: the data model needs no change.

1. **Setup checklist**: Google Cloud consent screen and OAuth client, Supabase Google provider, Email and Phone off, Site URL and redirect allow list (see Configuration required). Engineer task, done before step 5 can be tried. Satisfies **AC-9**, **AC-10**.
2. **Pure helpers with a check script**: `safeNextPath`, `classifyAuthResult`, the origin validators and `messages.ts` (copy, `AuthErrorCode`, `KNOWN_CANCELLATIONS`, starting empty) in `src/lib/auth/`, plus the table driven check script. Satisfies **AC-3**, **AC-7**, **AC-9**, **AC-12**.
3. **`requireUser()` and the auth response helper**: `src/lib/auth/require-user.ts` (cached, with the `requirePageUser` and `requireActionUser` wrappers; both return typed results, no error class) and `copyAuthResponseState`. Satisfies **AC-8**, **AC-12**.
4. **Private app layout**: route group `(app)` whose layout calls `requireUser()`, loads the profile and mounts `AppShell`, rendering the shared `AuthUnavailable` screen instead of its children when the state is `unavailable`, plus a normal app `error.tsx` with generic copy. Move `src/app/page.tsx` into `(app)` and drop its own `<main>`, since `AppShell` provides `<main id="main">`. Satisfies **AC-8**, **AC-12**.
5. **Sign in thread, end to end**: route group `(auth)` with the `/sign-in` page (outside `AppShell`, per `docs/design.md`), the client `SignInButton` with pending state (inline Google "G" mark, decorative), the always visible hint line, `signInWithGoogle` and `/auth/callback/route.ts` with explicit cookie and header adapters. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-9**, **AC-11**.
6. **Proxy gate**: extend `src/lib/supabase/proxy.ts`: GET/HEAD only redirects (signed out to `/sign-in?next=...`, signed in at `/sign-in` to `next`), indeterminate passes through, public paths exact (`/sign-in`, `/auth/callback`; static files stay excluded by the matcher), redirects built through `copyAuthResponseState`. Update the file's comment that says the redirect is still to come. Satisfies **AC-2**, **AC-4**, **AC-8**, **AC-12**.
7. **Account menu and Sign out**: `shadcn add dropdown-menu avatar`, apply the "After shadcn add" edits and pass `pnpm check:ui`; `AccountMenu` client component in the `AppHeader` actions slot with the avatar contract and the form outside the menu content; `signOut` Server Action with `scope: "local"` and a typed failure result. Satisfies **AC-5**, **AC-6**.
8. **States and polish**: problem `Alert` for the three codes, page metadata with `noindex`, 320px and keyboard pass. Satisfies **AC-7**, **AC-11**.
9. **Rework the unavailable rendering** (after the first build): add `AuthUnavailable`, make `requirePageUser` return the typed result, render the screen in the `(app)` layout and any guarded page, remove `AuthUnavailableError`, and change `(app)/error.tsx` to generic copy. No change to `requireUser()`, the proxy, the callback or the actions. Satisfies **AC-12**.
10. **Verify**: `/check verify sign in` against the real app: real Google sign in at phone width and on a preview URL (with a query in `next`), the captured cancel and deny cases, the outage drill, and the closed sign up checks.

## Consequences

**Positive**:
- The app is private with no new service or secret in the repo, and each protected entry point is safe even if the proxy or a layout is bypassed.
- Shared links survive sign in, including after a failed first attempt.
- An outage degrades to an error screen, not a mass sign out.
- Later features (#6, #7, #9, #11) get one `requireUser()` to call and can assume a verified user.

**Negative / tradeoffs**:
- Every protected page, data read and action must remember to call `requireUser()`; forgetting it is the new way to leave a hole. RLS still blocks the data, but the discipline has to be kept (and is worth a lint or review note later).
- Anyone without a Google account cannot use or review the demo.
- Setup is manual and spread over two dashboards; a missing redirect entry breaks sign in on that origin only, which is easy to miss on previews.
- One Supabase project means a settings mistake (for example re-enabling the Email provider) affects local, preview and production together.
- Sign out on one device does not end other sessions, and a failed sign out leaves the person signed in until retry.
- `KNOWN_CANCELLATIONS` starts empty, so until the real values are captured a cancel at Google shows the generic message.

**Neutral**:
- `src/app/page.tsx` moves into the `(app)` route group; URLs do not change.
- Two shadcn components (dropdown menu, avatar) are added.
- `/dev/ui` stays behind sign in like every other page (it is already dev only).

## Follow-up

- [ ] Account deletion UI is out of scope. The data rules exist (spec 0003 AC-13); a delete control needs a server side admin step, which conflicts with "no service role key", so design it before building.
- [ ] Add a short privacy notice and sign in terms line before real public users arrive (Google account data is stored in the EU region).
- [ ] If demo viewers need a way in without Google, revisit Option 2 (magic link) and set up a real email sender first.
- [ ] Deferred until evidence: a short lived return path cookie for `next` (only if a real run shows the query string being lost), blanket manual `sb-*` cookie deletion on sign out, and `revalidatePath("/", "layout")` on sign out (only if the AC-6 verify shows a stale page).
- [ ] When Vitest arrives (Beta), turn the `safeNextPath` and `classifyAuthResult` check script into unit tests.
- [ ] After building, `/sync` should add the sign in rules (`requireUser()` at every protected entry point, `safeNextPath`, Email and Phone providers off) to AGENTS.md; consider a nested `src/lib/auth/AGENTS.md` if they grow.
- [ ] Spec 0001 says `(auth)/sign-in`; this spec keeps that layout and adds an `(app)` group for the signed in shell.
