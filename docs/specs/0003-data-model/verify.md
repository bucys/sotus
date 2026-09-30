# Verify: Data model · spec 0003 · updated 2026-09-30
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `supabase db query --linked -f supabase/tests/rls.sql` (run when today's app wide attempt count is under 270) → no `FAIL:` error, and the final row shows every `*_left` as 0 and `vault_secret_present` as 1 → AC-1 to AC-15
- [ ] `supabase migration list --linked` → both `core_schema` and `rpc_functions` applied on `sotus-dev` → AC-1
- [ ] `supabase db advisors --linked --type security` → only the four expected `authenticated_security_definer_function_executable` warnings (`reserve_ai_attempt`, `finish_ai_attempt`, `save_recipe`, `open_existing_recipe`) → AC-6, AC-15
- [ ] `pnpm typecheck && pnpm lint` → clean, `database.types.ts` lists the four functions and the `my_collection` view → AC-1
- [ ] `vercel env ls | grep RECIPE_PUBLISH_SECRET` → present in Production, Preview and Development → AC-3

## Two session race (the script cannot run two transactions)
- [ ] Two signed in sessions each `reserve_ai_attempt('extract_web', <same new URL>)`, sign both payloads, and call `save_recipe` at the same moment → exactly one returns `out_created = true`, the other `false` with the same `out_recipe_id`; one `recipes` row; both users have a `saved_recipes` row; the loser's attempt ends `recipe` / `already_saved` → AC-4
- [ ] Repeat with a YouTube link (`extract_youtube`) → same result, one row for the `youtube_video_id` → AC-4
- [ ] Two sessions call `reserve_ai_attempt` at the same moment when the app is at 299 of 300 attempts today → exactly one succeeds → AC-10

## Value sourcing (one per row of the spec's table)
- [ ] `save_recipe`: send a payload with `added_by`, `source_url`, `source_kind` set to other values → the row uses `auth.uid()`, the attempt's URL and kind → AC-2
- [ ] `save_recipe` on a YouTube attempt → `source_metadata_fetched_at` is set; on a web attempt it is null → AC-14
- [ ] Ingredient and step order: send 3 ingredients and 3 steps in a chosen order → `position` follows array order → AC-1
- [ ] Signature: change one byte of the payload after signing → `invalid_signature`; set a different secret in Vercel than in Vault → every save fails as `invalid_signature` → AC-3
- [ ] `out_created` and the existing recipe ID: paste a known link with a `utm_source` tag → `out_created = false`, existing ID → AC-4
- [ ] `open_existing_recipe` with `?fbclid=x#frag` added to a known link → same recipe ID, caller saved, no `ai_attempts` row → AC-5
- [ ] Quota day: reserve near 23:59 UTC and just after 00:00 UTC (or shift `created_at` by hand) → counts reset at the UTC day boundary → AC-10
- [ ] Profile trigger: sign in with a real Google account once #5 lands → `display_name` is the Google name, `avatar_url` is an `https` URL → AC-12
- [ ] "Added by" source: delete a test user who added a recipe → `added_by` null, recipe and other users' saves stay → AC-13
- [ ] `my_collection` membership and `added_at`: save two recipes in turn → newest first, `added_at` equals the save row's `created_at` → AC-9

## Acceptance-criteria coverage
- AC-1 … rls.sql happy path, YouTube save, migration and types steps · AC-2 … rls.sql trust scenario, value sourcing · AC-3 … rls.sql signature and invalid scenarios · AC-4 … rls.sql duplicate scenario, two session race · AC-5 … rls.sql open existing · AC-6 … rls.sql visibility · AC-7 … rls.sql canonical read only · AC-8 … rls.sql updated at · AC-9 … rls.sql collection · AC-10 … rls.sql quota and URL keys, race · AC-11 … rls.sql finish scenarios · AC-12 … rls.sql profile trigger · AC-13 … rls.sql account deletion · AC-14 … rls.sql YouTube save · AC-15 … rls.sql privileges and cleanup
