# 0003. Data model: rationale

Decision record for [index.md](index.md). Not read during a build.

## Context

Sotus stores recipes that everyone signed in can read, each a snapshot of one source link, and each user keeps a collection of recipes they saved (importing saves automatically). (The first draft let the first importer edit the shared recipe for everyone; the engineer replaced that with canonical, read only snapshots, see *Canonical snapshots* below.) Recipes arrive from AI extraction of web pages and YouTube videos (0001, 0002), so their content is untrusted, and the same link can be pasted by several people, sometimes at the same moment.

The forces:
- **RLS is the primary database authorization boundary** (0001, AGENTS.md). There is no service role key and no separate backend, so a signed in user can call any table or RPC the app can, with the publishable key and their own session. Whatever the app enforces in TypeScript alone, a curious user can bypass. (As decided below, publication into the shared library additionally requires a server authenticated HMAC; RLS alone cannot tell the app's call from a user's direct call.)
- **Every AI call must be reserved against quota first, and only an accepted recipe is saved, atomically** (0001). The attempt row doubles as failure tracking for #10.
- **The shared library must hold one recipe per link.** 0002 already requires this for YouTube; the engineer extended it to web pages and asked that a duplicate import still lands the recipe in the importer's collection, with races settled cleanly.
- **Later extras** (tags, meal plans, shopping lists, serving scaling, search by ingredient) must fit without reshaping existing tables.
- Scale is a course demo: under 50 users, one Supabase project shared by all environments, no test runner, Alpha tier.

Constraint carried from #5 (not built yet): Google sign in fills `auth.users.raw_user_meta_data`; the profile trigger relies on its `full_name`, `name` and `avatar_url` keys.

## Options considered

### Option 1: Relational tables, writes through guarded functions, database generated dedup keys (plus signed publication, see below)

Child tables for ingredients and steps, a saves join table, profiles, attempts. Recipes are inserted only by a `SECURITY DEFINER` `save_recipe` that takes the importer and source from the session and the attempt; dedup keys are generated columns with unique constraints.

**Pros**: identity, attribution and races are enforced by the database, not trusted from the caller; ingredient search and future lists are plain SQL.
**Cons**: the most SQL to write and review (four definer functions, a URL normalizer in SQL, column grants).

### Option 2: One recipe row with jsonb lists, direct inserts under RLS

Ingredients and steps as jsonb on `recipes`; the app inserts with an RLS `with check (owner_id = auth.uid())` policy; attempts still through the 0001 functions.

**Pros**: fewest objects; save and edit are single row writes.
**Cons**: a direct insert cannot be tied to a reserved attempt, so quota and "only accepted recipes are saved" become app conventions a user can skip; jsonb makes ingredient search and shopping lists awkward; contradicts 0001 and 0002, which already name the child tables.

### Option 3: Relational tables, app computed keys, direct inserts under RLS

Same tables as Option 1, but the Server Action computes `source_url_key` and `youtube_video_id` and inserts rows itself, with RLS insert policies for the owner.

**Pros**: less SQL; the URL normalizer lives in TypeScript next to `safeFetch`.
**Cons**: keys and source fields come from the client, so a user can write any key and squat or dodge dedup; multi table inserts are not atomic from the client; races surface as errors the app must untangle.

### Publication trust (added after review)

Option 1 alone still lets a signed in user call `save_recipe` directly with invented content under a real URL, taking that link's dedup key for everyone. Four ways to close it were weighed:

- **HMAC signed publication (chosen)**: the server signs `attempt:user:payload` with a secret held in Vercel and Supabase Vault; `save_recipe` verifies it. *Pros*: no new driver or connection, RLS unchanged, the secret can only authorize one publication for the caller's own open attempt. *Cons*: one secret in two places, set by hand and rotated together.
- **Dedicated publisher database role**: the server connects directly to Postgres as a role that can only execute a publish function. *Pros*: isolation by database privilege. *Cons*: a new database credential, a Postgres driver and pooling on Vercel, and the function must trust a user ID the server passes, which is a wider trust boundary than the HMAC.
- **Accept the risk**: *Pros*: nothing to build. *Cons*: with one shared library and first writer wins, one call poisons a link for everyone, permanently in this release.
- **Drop global dedup**: *Pros*: poisoning only affects the attacker's own copy. *Cons*: loses one recipe per link and the collection save on duplicates, both engineer requirements.

## Rationale

Option 1, because the one force that dominates here is that every caller holds the same keys as the app, so RLS (the primary boundary) must carry every rule, and where RLS cannot tell the app from a user (publication), a server secret must. Option 2 and Option 3 both let the caller supply fields the engineer explicitly said must not be trusted (owner, source identity, dedup keys), and both lose the 0001 rule that nothing is saved without a reserved, finished attempt. Option 1's extra SQL is paid once and proved by the RLS script; the others would push the same rules into app code that a direct API call skips.

Generating the keys in the database is also what makes the duplicate behavior simple: `on conflict do nothing` plus a lookup gives the race loser the winner's recipe inside one function, with no error handling in TypeScript.

The first draft accepted direct call poisoning as a residual risk. That was wrong for this product: dedup makes the first writer's recipe the only one for its link, so a planted recipe is not one bad row among many but the library's answer for that link, for every user, and nothing in this release can repair it. Signed publication removes the risk for the cost of one secret, without the service role key 0001 rules out.

### Canonical snapshots (engineer's correction)

The first draft made the first importer the owner and sole editor of the shared recipe, so their edits changed it for everyone who saved it. The engineer rejected that: a library recipe is the canonical Sotus snapshot of its source, the source URL is provenance and dedup identity, and personal changes belong to #13 as a layer that never mutates the shared row. Consequences for the schema: `owner_id` becomes `added_by` (attribution only), the owner update policy and the `update (title)` grant are removed, `updated_at` moves only on content columns, and #13 must keep personal versions outside `recipes`. It fits dedup better too: one link, one snapshot nobody can silently rewrite. The cost is that honest extraction mistakes can't be fixed by anyone in the app until an admin path exists, which is now a launch gate.

### Smaller calls

| Call | Pick | Why | Runner up |
|---|---|---|---|
| Who added it | `profiles` table filled by a sign up trigger | `auth.users` is not readable under RLS; standard Supabase pattern | Name copied onto each recipe (goes stale) |
| Ingredients and steps | Child tables with `position` | Search, shopping lists, matches 0001/0002 | jsonb arrays |
| Collection | `saved_recipes` is the only membership source; every import (new or duplicate) inserts the importer's save row; anyone can unsave anything | Engineer's correction after `added_by` became attribution only: one rule, no importer special case, unsave works for imports too | Derive "added by me" into the collection (first draft; kept an ownership idea that no longer exists) |
| Delete | None in v1 | Not in scope; keeps shared saves stable | Owner delete with cascade |
| Quantity | Text as stated | Keeps `1 1/2`, `2-3`, `a pinch`; fits grounding | Text plus parsed number |
| Extra recipe fields | None now | Gemini's schema produces none; nullable columns are cheap later | `image_url` |
| Web dedup | Unique URL key, normalized conservatively (case, default port, fragment, known tracking parameters only) | A false merge shows the wrong recipe; a missed merge only leaves a duplicate | Aggressive normalization (`www.`, scheme, trailing slash), rejected after review |
| Account deletion | Recipes kept, `added_by` set null, nothing else changes | Engineer's choice: the canonical recipe must not depend on its importer | Cascade everything |
| Profile content | Google name and avatar, not editable | Enough for #8 | Name only |
| Save privacy | Own rows only | Nothing in scope shows others' saves | Public counts |
| Attempt reason | Plain text, typed in the app | Reasons grow with every feature; no migration each time | Postgres enum |
| Cook picks | Not stored | Nothing reads them back | History table |
| RLS tests | SQL script in a rolled back transaction | No Docker or new tool; one cloud project | pgTAP |
| Raw ingredient line | Not stored | One shape for every source | Nullable `original_text` |
| Build scope | Release 1 surface only | Skateboard: nothing unused ships | Include `update_recipe` now |
| Attribution column | `added_by` → `profiles(id)` | Name says attribution, not authority; FK to `profiles` lets the Data API embed the profile in one query | Keep `owner_id` (implies edit rights) |
| Duplicate before reserve | `open_existing_recipe` RPC | One normalizer (SQL) for both the check and the key; saves in the same call | App computes the key and queries `recipes` |
| Recipe edits | None for any user; canonical snapshot | Engineer's correction; personal changes go to #13 outside `recipes` | Importer edits the shared row (first draft) |
| Helper privileges | No `EXECUTE` grant on `private` helpers to anyone but `postgres` | Every permitted `recipes` write runs as `postgres` (definer function, foreign key action) | Grant `EXECUTE` to `authenticated` (only needed if users ever write `recipes` directly) |
| Default privileges | Closed for `anon` and `authenticated` on tables, sequences and functions (functions also `public`), in `public` and `private` | Later migrations cannot silently expose objects | Close only `anon` (first draft) |
| `web_url_key` ports | Drop only the scheme's own default port | `https://x:80` and `http://x:443` are different endpoints | Drop 80 and 443 for any scheme (first draft) |
| Updated at | `BEFORE UPDATE` trigger | Cannot be forgotten by any writer | Set in each RPC |
| Attempt owner delete | Set null, row kept | App wide quota and #10's failure history must survive account deletion (reversed after review; cascade let deletion reset the app wide count) | Cascade |
| Recipe publication | HMAC signature verified in `save_recipe` | Stops direct call poisoning without a service role key (see *Publication trust*) | Dedicated publisher role |
| YouTube metadata | Stored with `source_metadata_fetched_at`, refresh or clear job as a launch gate | Useful context on #8 for the demo; the timestamp makes the policy job possible later | Don't store title or channel |
| Collection read | `my_collection` view, `security_invoker` | A testable artifact; one named read for #11 that RLS scopes to the caller's saves | Query written in #11 |
| Timestamps on update | `clock_timestamp()` | `now()` is fixed per transaction, so updates inside one transaction would look unchanged | `now()` |
| Quota lock | One app wide advisory lock | Trivial at this traffic; exact counts | Row counts without a lock (can overshoot) |
| `source_title`, `source_channel_title` | Accepted from the signed payload | Descriptive only, never a key; the signature proves the server fetched them | Fetched again in SQL (not possible without HTTP) |

## Evidence: review reconciliation (2026-09-30)

Two independent reviews of the first draft: a Sonnet cross check (25 findings) and a Codex adversarial review supplied by the engineer (focus points: poisoning, a narrow publication mechanism, quota after user deletion, conservative URL normalization, explicit revokes, byte and index limits, persisted YouTube metadata). Overlaps were merged into one fix each.

| Topic | Source | Resolution |
|---|---|---|
| Direct `save_recipe` poisons the shared library | Codex (blocker) | Signed publication; residual risk no longer accepted |
| App wide quota drops when a user is deleted | Codex | `ai_attempts.user_id` set null, rows kept |
| URL normalization too aggressive | Codex, Sonnet 7 | Conservative `web_url_key` with 11 test vectors |
| Default grants re-open objects to `anon` | Codex, Sonnet 11 | Explicit revokes, grants and default privileges |
| Index row size on long non ASCII URLs | Codex, Sonnet 6 | Byte caps on URL columns, checked at reserve and in the table |
| YouTube data retention | Codex | `source_metadata_fetched_at` plus a launch gate |
| `now()` makes `updated_at` untestable | Sonnet 1 | `clock_timestamp()` |
| `anon` and forbidden writes are denied, not empty | Sonnet 2 | ACs and tests say "denied" |
| Collection had no artifact; owner could save own recipe | Sonnet 3, 25 | `my_collection` view; the own recipe block was later removed when saves became the only membership source |
| Sign up trigger could block sign in | Sonnet 4 | Blank skip, cut to 100, safe avatar |
| Web attempt on a YouTube URL duplicates a video | Sonnet 5 | Reserve and lookup reject YouTube hosts for `web` |
| Payload shape and blank rules | Sonnet 8 | `jsonb_typeof` checks, `\S` blank rule, blanks fail |
| Output names clash with columns | Sonnet 9 | `out_recipe_id`, `out_created`, `VOLATILE` |
| Save twice needs an update grant | Sonnet 10 | `ignoreDuplicates` insert |
| `interrupted` had no artifact | Sonnet 12 | Left to #10's read rule; late finish allowed |
| One way `recipe_page_url` rule, loose field rules | Sonnet 13, 14, 24 | Two way checks, scheme check, channel YouTube only, trimmed title |
| Anonymous or email sign up metadata | Sonnet 15 | Google only, anonymous off, stated as a requirement |
| Pasted URL secrets | Sonnet 16 | User info rejected, trim in the function, remaining exposure accepted and stated |
| Test script mechanics and gaps | Sonnet 17 | Exception sub blocks, `reset role`, post rollback count, usage note, added scenarios |
| Raw Postgres errors | Sonnet 18 | `invalid_arguments`; unknown errors map to `ingestion_failed` |
| Changing the normalizer later | Sonnet 19 | Migration procedure noted; functions `strict immutable parallel safe` |
| Orphaning moves `updated_at` | Sonnet 20 | Accepted, stated in AC-8 |
| Keyset pagination details | Sonnet 21 | `(created_at desc, id desc)` index, raw timestamp cursor |
| Quota error and lock order | Sonnet 22 | Both limits raise `quota_exceeded`; lock before count |
| Unfixable squatted recipe | Sonnet 23 | Superseded by signed publication; admin path is a launch gate |

Second pass, from the engineer before acceptance:

| Topic | Resolution |
|---|---|
| Shared recipe edit semantics | Canonical read only snapshots; `owner_id` → `added_by`; #13 personal layer outside `recipes` |
| Default ports per scheme | `:80` dropped only for `http`, `:443` only for `https`; two new test vectors |
| Generated column helper privileges | No grant needed: all permitted writes run as `postgres`; tests prove the paths and the denial |
| Default privileges close `authenticated` too | Tables, sequences and functions closed for `anon` and `authenticated` (functions also `public`) |
| "RLS is the only boundary" wording | RLS is the primary database boundary; publication also needs the server HMAC |
| Importer special case in the collection | Removed: every import writes a save row, `my_collection` reads only `saved_recipes`, anyone can unsave anything, the own recipe insert check is gone |
