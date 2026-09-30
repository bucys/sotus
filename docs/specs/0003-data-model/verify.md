# Verify: Data model · spec 0003 · updated 2026-09-30
_Status 2026-09-30: PASS. All blocking steps ticked; the section below is deferred on purpose._
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `supabase db query --linked -f supabase/tests/rls.sql` (run when today's app wide attempt count is under 270) → no `FAIL:` error, and the final row shows every `*_left` as 0 and `vault_secret_present` as 1 → AC-1 to AC-15
- [x] `supabase migration list --linked` → both `core_schema` and `rpc_functions` applied on `sotus-dev` → AC-1
- [x] `supabase db advisors --linked --type security` → only the four expected `authenticated_security_definer_function_executable` warnings (`reserve_ai_attempt`, `finish_ai_attempt`, `save_recipe`, `open_existing_recipe`) → AC-6, AC-15
- [x] `pnpm typecheck && pnpm lint` → clean, `database.types.ts` lists the four functions and the `my_collection` view → AC-1
- [x] `vercel env ls | grep RECIPE_PUBLISH_SECRET` → present in Production, Preview and Development → AC-3

## Two session race (the script cannot run two transactions)
- [x] Two signed in sessions each `reserve_ai_attempt('extract_web', <same new URL>)`, sign both payloads, and call `save_recipe` at the same moment → exactly one returns `out_created = true`, the other `false` with the same `out_recipe_id`; one `recipes` row; both users have a `saved_recipes` row; the loser's attempt ends `recipe` / `already_saved` → AC-4
  - Evidence 2026-09-30: manual deterministic race. B blocked, then `out_created = false` with A's `recipe_id`; five verification booleans true; cleanup counts 0.
- [x] Repeat with a YouTube link (`extract_youtube`) → same result, one row for the `youtube_video_id` → AC-4
  - Evidence 2026-09-30: manual deterministic race. Terminal B blocked on A's uncommitted insert, returned `out_created = false` with A's `recipe_id`; six verification booleans true; cleanup counts 0.
- [x] Two sessions call `reserve_ai_attempt` at the same moment when the app is at 299 of 300 attempts today → exactly one succeeds → AC-10
  - Evidence 2026-09-30: manual deterministic race at 299. B blocked on the advisory lock, returned `quota_exceeded` after A committed; four verification booleans true; cleanup counts 0.

## Value sourcing (one per row of the spec's table)
- [x] `save_recipe`: send a payload with `added_by`, `source_url`, `source_kind` set to other values → the row uses `auth.uid()`, the attempt's URL and kind → AC-2
  - Evidence 2026-09-30: rls.sql 'AC-2 payload attribution and source fields are ignored' (assertion passed in the `rls.sql` run).
- [x] `save_recipe` on a YouTube attempt → `source_metadata_fetched_at` is set; on a web attempt it is null → AC-14
  - Evidence 2026-09-30: rls.sql 'AC-14 youtube recipe stores the metadata fetch time' and 'AC-14 web recipe has no metadata fetch time' (assertion passed in the `rls.sql` run).
- [x] Ingredient and step order: send 3 ingredients and 3 steps in a chosen order → `position` follows array order → AC-1
  - Evidence 2026-09-30: rls.sql 'AC-1 ingredients in order' and 'AC-1 steps in order' (assertion passed in the `rls.sql` run).
- [x] Signature: change one byte of the payload after signing → `invalid_signature` → AC-3
  - Evidence 2026-09-30: rls.sql AC-3 signature scenario, a signature over a different payload returns `invalid_signature` (assertion passed in the `rls.sql` run).
- [x] `my_collection` membership and `added_at`: save two recipes in turn → newest first, `added_at` equals the save row's `created_at` → AC-9
  - Evidence 2026-09-30: rls.sql 'AC-9 my_collection lists B's saves once each, newest first'; `added_at` is `saved_recipes.created_at` in the view definition (assertion passed in the `rls.sql` run).

## Deferred, non blocking for Alpha
_Not required to accept #3. The SQL level behavior is already proved by `rls.sql`; these need a live app, a real account or a clock boundary._
- [ ] Google and account steps, deferred to feature #5: sign in with a real Google account → `display_name` is the Google name, `avatar_url` is an `https` URL → AC-12
- [ ] Google and account steps, deferred to feature #5: delete a real user who added a recipe → `added_by` null, recipe and other users' saves stay → AC-13
- [ ] UTC day boundary: reserve near 23:59 UTC and just after 00:00 UTC → counts reset → AC-10
- [ ] Vault secret mismatch: set a different secret in Vercel than in Vault → every save fails as `invalid_signature` → AC-3
- [ ] Live link variants: a known link with `utm_source` → `out_created = false`, existing ID (AC-4); `open_existing_recipe` with `?fbclid=x#frag` → same ID, no `ai_attempts` row (AC-5)

## Acceptance-criteria coverage
- AC-1 … rls.sql happy path, YouTube save, migration and types steps · AC-2 … rls.sql trust scenario, value sourcing · AC-3 … rls.sql signature and invalid scenarios · AC-4 … rls.sql duplicate scenario, two session race · AC-5 … rls.sql open existing · AC-6 … rls.sql visibility · AC-7 … rls.sql canonical read only · AC-8 … rls.sql updated at · AC-9 … rls.sql collection · AC-10 … rls.sql quota and URL keys, race · AC-11 … rls.sql finish scenarios · AC-12 … rls.sql profile trigger · AC-13 … rls.sql account deletion · AC-14 … rls.sql YouTube save · AC-15 … rls.sql privileges and cleanup
