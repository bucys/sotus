# Rationale: 0005. Sign in: Google only, with a private app behind it

_Decision record for [spec 0005](index.md): context, options considered and rationale._

## Context

Spec 0001 already chose the sign in approach: Supabase Auth with the Google provider only, the PKCE flow (a safer code exchange for sign in redirects) through `@supabase/ssr` cookies, one `/auth/callback` route handler, and a request proxy (`src/proxy.ts`) that refreshes the session and redirects signed out visitors. The scaffold wired the Supabase clients and the proxy, but the redirect itself was left for this feature, together with the Google OAuth client and the Supabase redirect settings. Spec 0003 gives every new `auth.users` row a `profiles` row (display name and avatar from Google), and its read rules assume that every visitor to the app is signed in.

Scope #5 says "a person can sign up, sign in, and sign out on a phone; signed out visitors are sent to sign in". The first version is a mobile first web app where everyone signed in sees every recipe, so there is no public page to protect for search engines. The one Supabase project `sotus-dev` serves localhost, Vercel previews and production, so the redirect settings must cover all three origins at once.

Three forces shape the design beyond the happy path:
- The Supabase publishable key is public by design. If the Email provider stays enabled in the Supabase dashboard, anyone can call `signUp` from a browser console, become a "signed in user" and spend AI quota. "Google only" has to be true in the project settings, not only in the UI.
- A proxy is skippable (a matcher mistake, a refactor), and a shared layout does not re-render on client side navigation. Neither can be the security guarantee. Server Actions are plain POST endpoints that anyone can call without visiting a page.
- Supabase can be paused (spec 0001) or briefly unreachable. "Cannot tell who this is" must not look the same as "signed out", or an outage would sign everyone out and bounce them through Google.

## Options considered

### Option 1: Google only, Supabase Auth, Server Action starts the flow
The sign in button posts a form to a Server Action that calls `signInWithOAuth` and redirects to Google. The callback route exchanges the code for a session. Fits spec 0001 and the server first rule.

**Pros**:
- No new service, no email, no password reset flow.
- Works before JavaScript finishes loading (a plain form post).
- One OAuth client, one provider to keep correct.

**Cons**:
- Needs a Google account. A reviewer without one cannot sign in.
- Depends on Google's consent screen being published (a one time setup step).

### Option 2: Google plus email magic link
Adds a second way in for people without Google.

**Pros**:
- Covers demo viewers without a Google account.

**Cons**:
- Needs an email sender; Supabase's built in mail is limited to a few messages an hour, so a real sender is needed.
- Doubles the sign in surface to test, and the profile trigger sees accounts with no name or photo.

### Option 3: Google only, but the button calls `signInWithOAuth` in the browser
A client component starts the flow.

**Pros**:
- The documented browser example; no server action.

**Cons**:
- Needs a client component and JavaScript for the one action that must always work.
- Origin and `next` handling move into client code.

### Option 4: A hosted auth provider
A separate service handles sign in and sessions.

**Pros**:
- Prebuilt screens and extra methods.

**Cons**:
- A second user store beside Supabase, so `auth.uid()` and row level security would no longer line up. Rejected in spec 0001.

## Rationale

Spec 0001 already settled the approach, and every force in Context points the same way: the project runs on Supabase, so its built in auth keeps `auth.uid()` and the row level security rules working with no glue. Google only avoids email sending entirely, which matters because the built in mail is rate limited. A Server Action for the button follows "Server first" and keeps the one action that must work free of JavaScript.

The auth boundary is layered on purpose. The proxy is fast UX (redirect before rendering) but skippable. The layout is skipped on soft navigation. A Server Action is reachable without either. So each protected entry point asks `requireUser()` itself (one function, cached per request with React `cache`, so repeated calls cost one check), and RLS still decides data access if app code ever misses a check.

`next` stays in the query string, not a cookie. It is already validated everywhere it is read, it makes retry after a failure trivial (the sign in page carries it forward), and a cookie adds a second state store that has to be cleared. Revisit only if a real failure shows the query string being lost (see Follow-up).

The engineer chose Google only and a full private app. The cost, accepted here: people without a Google account cannot try the demo. Option 2 is the cheapest way to add them later.

