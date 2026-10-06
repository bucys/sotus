# Review, feat/sign-in, 2026-10-06

**Reviewed by**: Sonnet 5.5 (author on same family; fresh context)
**Scope**: 30 files, branch vs main
**Verdict**: Changes requested

## Summary
Adds Google-only sign in: pure helpers (`safeNextPath`, `classifyAuthResult`, origin check), `requireUser()`, proxy gate, callback with a cookie carrier, account menu and sign out. The code is tight and follows the spec closely; open-redirect and cookie-preservation handling are solid. One real demo risk: the proxy and the layout can disagree about who is signed in, which produces a redirect loop.

## Major
### 🟠 Possible infinite redirect when the JWT is valid but the session or user is gone, `src/lib/supabase/proxy.ts:70` and `src/app/(app)/layout.tsx:11`
**Problem**: The proxy decides with `getClaims()`, which with asymmetric signing keys verifies the JWT locally and does not ask Auth. The layout and `/sign-in` decide with `getUser()`, which does. If the access token is still valid (up to the JWT expiry, 1h by default) but the user was deleted or the session revoked, the proxy says signed_in and `getUser()` says signed_out. `/` then redirects (layout) to `/sign-in`, the proxy sends a "signed in" GET to `/sign-in` back to `/`, and so on until the browser shows ERR_TOO_MANY_REDIRECTS.
**Why it matters**: Easy to hit when prepping a demo (delete the test user or its sessions in the Supabase dashboard, then reload with the old browser). The person is stuck until the token expires or they clear cookies.
**Suggested fix**: Break the loop on one side. Either do not redirect signed in GETs of `/sign-in` in the proxy (let the page do it with `getUser()`, which it already does at `sign-in/page.tsx:33`), or have the proxy confirm with `getUser()` before that one redirect. Then confirm by deleting a user while its cookie is live.

## Minor
### 🟡 Proxy matcher gates public static files, `src/proxy.ts:11`
**Problem**: Only a few image extensions are excluded. `/robots.txt`, `/sitemap.xml`, manifests, `.ico` other than favicon, fonts or `.json` under `public/` redirect signed out visitors (and crawlers, link unfurlers) to `/sign-in`.
**Why it matters**: Nothing breaks today (`public/` holds only svgs), but it will bite when a manifest, robots file or OG image arrives.
**Suggested fix**: Add the needed extensions or exact paths to the matcher or `PUBLIC_PATHS` when those files appear.

### 🟡 Sign out back/reload not yet verified, `docs/specs/0005-sign-in/verify.md:19`
**Problem**: AC-6 back and reload after sign out is still unchecked. The Router Cache or bfcache could show the previous protected page on Back.
**Why it matters**: Showing a signed in page after sign out on a shared phone is the exact case AC-6 exists for (data is still safe, the proxy blocks any fetch).
**Suggested fix**: Run that verify step on the production build; add `revalidatePath("/", "layout")` only if it shows stale content, as the spec says.

### 🟡 `/sign-in` ignores the unavailable state, `src/app/(auth)/sign-in/page.tsx:32`
**Problem**: With `requireUser()` returning `unavailable`, the page shows the normal sign in form with no hint.
**Why it matters**: During a Supabase outage or paused project the person taps the button and gets the `unavailable` message from the action; acceptable, just less direct. The paused-project case is the likeliest demo failure, so wake it before the demo.
**Suggested fix**: Optional: show the `unavailable` message up front when status is `unavailable`.

### 🟡 Sign out failure alert is a fixed overlay, `src/components/auth/account-menu.tsx:69`
**Problem**: `fixed ... top-20 z-50` hard codes a header offset and sits outside the document flow; it has no dismiss.
**Why it matters**: Only shows on a failed sign out; may overlap content on small screens.
**Suggested fix**: Acceptable for Alpha; revisit with a toast pattern later.

### 🟡 All 4xx treated as signed out, `src/lib/auth/classify-auth-result.ts:30`
**Problem**: Any 4xx except 429 returns `signed_out`, including 408 and unexpected client errors.
**Why it matters**: A rare misclassification would bounce a signed in person to sign in; it never leaks access.
**Suggested fix**: Optionally limit to 400, 401, 403 and 404 and treat other 4xx as `unavailable`, matching the "unrecognised is unavailable" principle.

## Nits
- ⚪ `src/app/(app)/error.tsx:3`, `authMessages` holds the app error copy; the name suggests auth only. Fine for now.
- ⚪ `src/lib/auth/actions.ts:31`, `code: string` could be `AuthErrorCode`.
- ⚪ `src/app/(app)/page.tsx:9`, "Scaffold only" copy is visible right after sign in; swap before a demo.

## Strengths
- `safeNextPath` validates before and after normalization with a table check script covering the nasty cases; every redirect target is origin plus validated path.
- `copyAuthResponseState` and the callback cookie carrier keep session and no-store headers on every redirect path.
- Indeterminate auth is never treated as signed out; `requireUser()` is cached, typed and never throws for expected failures.
- Per request Supabase client, `getUser()`/`getClaims()` only (never `getSession()`), no provider text ever shown.

## Test coverage
None by design (Alpha); the gate is typecheck plus `/check verify`. Verify should exercise the stale-token redirect loop above, back/reload after sign out, and the outage drill, none of which typecheck can catch.
