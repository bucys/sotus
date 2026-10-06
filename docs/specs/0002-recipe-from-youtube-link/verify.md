# Verify: Recipe from a YouTube link (slice 1) · spec 0002 · updated 2026-10-06
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: `YOUTUBE_API_KEY` is set in `.env.local` (build plan task 1), sotus-dev is awake, and you are signed in. Pick four real videos: one whose description links a recipe site with JSON-LD, one Short with the full recipe in its description, one cooking video with neither, and one deleted or private video ID.

## UI / manual
- [ ] Paste `https://youtu.be/<id>?si=abc`, `https://m.youtube.com/watch?v=<id>&t=30` and `https://www.youtube.com/shorts/<id>` for the same new video, one at a time → each runs the YouTube pipeline, and the attempt row's `source_url` is `https://www.youtube.com/watch?v=<id>` → AC-1, AC-2
- [ ] Paste `https://www.youtube.com/@somechannel` → field error "That YouTube link doesn't point to a video.", `aria-invalid` on the input, no new `ai_attempts` row → AC-1
- [x] While a YouTube link runs → button disabled with a spinner and "Reading…", status region reads "Reading the video… this can take about a minute", a second Enter does nothing → AC-10
- [x] Creator page video → lands on the recipe page with "From the creator's recipe page"; the row has `extraction_method = youtube_recipe_page_jsonld` and `recipe_page_url` set to the linked page; the title is the page's JSON-LD name → AC-4, AC-9
- [x] Description Short → "From the video description"; `extraction_method = youtube_description`; every ingredient name appears in the description; the attempt row has non zero tokens → AC-5, AC-6, AC-9
- [x] Either saved recipe → the page shows the thumbnail (`i.ytimg.com/vi/<id>/hqdefault.jpg`, with alt text), the video title and channel, and "Watch on YouTube" opens the canonical watch URL in a new tab; the row has `source_title`, `source_channel_title` and `source_metadata_fetched_at` → AC-9
- [x] Paste a saved video again (any link form) → lands on it with "This video is already in the library.", a `saved_recipes` row exists for you, and no new attempt row → AC-3
- [x] Unsave it (SQL delete of your `saved_recipes` row), paste again → the row comes back, still no attempt row → AC-3
- [x] Video with no recipe → alert "This video doesn't include a written recipe we can read yet.", attempt ends `insufficient` / `no_written_recipe`, never `not_a_recipe`; focus returns to the field with the link kept → AC-7, AC-10
- [x] Deleted or private video ID → "This video isn't available. It may be private, deleted or still live.", attempt ends `ingestion_failed` / `video_unavailable` with zero tokens (no Gemini call) → AC-8
- [ ] Two signed in browsers paste the same new video at once → one `recipes` row, both users end on it, both have a `saved_recipes` row, both attempts end `recipe` (one with reason `already_saved`) → AC-13 (deferred for Alpha, 2026-10-06)
- [ ] `GEMINI_TEST_FAILURE=503-twice pnpm dev`, paste the description Short (unsaved) → "Our recipe reader is busy right now. Try again in a minute.", attempt ends `ingestion_failed` / `provider_error`, log line shows `gemini_calls: 2` → AC-12 (deferred for Alpha: the pipeline run gave `provider_error` with `gemini_calls: 2`; the on screen message was not checked)
- [ ] Put a wrong `YOUTUBE_API_KEY` in `.env.local` → "We couldn't reach YouTube just now. Try again in a minute.", attempt ends `metadata_unavailable`, and no log line contains the key → AC-8, security model (deferred for Alpha: the pipeline run gave `metadata_unavailable` with no key in any log; the on screen message was not checked)
- [x] Remove `YOUTUBE_API_KEY` from `.env.local` and paste a new video → "We couldn't reach YouTube just now. Try again in a minute.", no new `ai_attempts` row and today's count unchanged; a web page link still works → AC-11, security model

## Value sourcing
- [x] Route: `music.youtube.com/watch?v=<id>` takes the YouTube path (field error), never a `safeFetch` log line → host of the input
- [ ] Video ID and canonical URL: the `si=` and `t=` values never appear in the attempt row, the recipe row or any log line → parsed then rebuilt
- [ ] Duplicate ID: the dedup works across link forms (`youtu.be` after `/shorts/` of the same ID) → `open_existing_recipe` on the canonical URL
- [ ] Quota: the 21st reserved paste of the day shows "You've reached today's limit for adding recipes. Try again tomorrow."; a parse failure or duplicate does not count → `reserve_ai_attempt`, AC-11 (deferred for Alpha, 2026-10-06)
- [ ] Title, description, channel: change nothing in the app, compare the row's `source_title` and `source_channel_title` to the YouTube page → Data API `videos.list`
- [ ] Candidate links: a description whose first link is Instagram and second is a recipe site still finds the recipe site; the log line shows `links_tried` ≤ 2 → description URLs minus the deny list
- [ ] Title overlap: a creator page whose JSON-LD name shares no dish word with the video title is not used (`links_off_topic: 1`), and the ladder moves on to the description → JSON-LD `name` vs `snippet.title`
- [ ] Recipe title: a description recipe whose model title is blank is saved under the video title → JSON-LD `name` → extracted title → `snippet.title`
- [ ] Grounding source: a description with chapter timestamps (`0:25 Bake`) and no stated time never saves a step with "25" → title plus description, cleaned
- [ ] `added_by`, `source_kind`, `source_url`: the row has your user ID, `youtube` and the canonical URL → `auth.uid()` and the attempt inside `save_recipe`
- [ ] Tokens: after a retry, the attempt's tokens equal the sum of both calls in the log line → `usageMetadata` summed
- [ ] Provenance line: a web recipe still shows "From <host>", a YouTube one shows its "From the …" text → `extraction_method` + `source_kind`
- [ ] Thumbnail: the image URL is built from `youtube_video_id`, not from stored data → derived from the ID
- [ ] Notice: `/recipes/<id>?notice=already-in-library` shows the video text on a YouTube recipe and the web text on a web recipe → query parameter

## Commands
- [x] `pnpm check:extraction` → "extraction checks passed" (YouTube link forms, duration, watchability, creator links, title overlap, ladder, timestamp grounding all green) → AC-1, AC-2, AC-4, AC-6, AC-7, AC-8
- [x] `pnpm typecheck && pnpm lint && pnpm check:ui && pnpm build` → all green
- [x] `grep -rn "YOUTUBE_API_KEY" src` → read only in `src/lib/extraction/youtube/youtube-metadata.ts`, behind `server-only` → security model

## Acceptance-criteria coverage
- AC-1 link forms, invalid link · AC-2 canonical URL, value sourcing · AC-3 duplicate, re-save · AC-4 creator page, overlap · AC-5 description · AC-6 grounding, timestamps · AC-7 no recipe · AC-8 unavailable, bad key · AC-9 saved fields, recipe page · AC-10 pending · AC-11 quota · AC-12 retry · AC-13 race
- AC-14 to AC-16 are slice 2 (gated by spike 2), not covered here.

## Verify run · 2026-10-06
_Signed in manual run by the engineer, plus `/check verify` pipeline runs against real YouTube and Gemini and reads of sotus-dev._
- Manual, signed in: pending state and status text, landing on `/recipes/[id]`, thumbnail, video title, channel and "Watch on YouTube", duplicate paste opens the existing recipe, unsaving then pasting again brings the save back, the no recipe message, the link kept and focus on failure.
- sotus-dev: the description save `88DdbmpzDJc` is `youtube_description` with 715 / 548 tokens, canonical `source_url` and `source_metadata_fetched_at` set; only two `extract_youtube` attempt rows exist, so the duplicate paste and the paste after unsaving reserved nothing; the no recipe attempt is `insufficient` / `no_written_recipe` with 0 tokens.
- Manual follow up, signed in: the creator page video `9zCVCL4V8JQ` saved in the browser as `youtube_recipe_page_jsonld`, `recipe_page_url` = `https://preppykitchen.com/pancake-recipe/`, attempt tokens 0 / 0, page rendered. Pipeline: plantyou.com also saved this way; a missing video ID gives `video_unavailable` with 0 tokens; ingredients and amounts in `hvZs62R3VQg` checked against the real description.
- Deferred for Alpha, by the engineer's call: the 21st paste quota boundary, the two user race, and the failure switch and wrong key drills in the UI.
- Deferred for Alpha, by the engineer's call: the remaining value sourcing rows, the three link forms row and the `@somechannel` `aria-invalid` row. They rest on `pnpm check:extraction`, the pipeline runs and the database reads above.
- Deleted video, signed in: `https://www.youtube.com/watch?v=AAAAAAAAAAA` showed the unavailable message; sotus-dev row at 14:37:33 UTC is `extract_youtube` / `ingestion_failed` / `video_unavailable`, 0 / 0 tokens, no `recipes` row. The earlier missing row came from a paste that was not this ID.

- Missing key drill, after the /debug fix (`YOUTUBE_API_KEY= pnpm dev`, signed in): four YouTube pastes each logged `youtube_not_configured` (host only, no key) and showed the "couldn't reach YouTube" message; `extract_youtube` stayed at 4 rows for the day. A new web link saved `antmedineslenteles.com` (`extract_web` 4 → 5, outcome `recipe`). Real `videos.list` for `88DdbmpzDJc` and `9zCVCL4V8JQ` still read 112 s and 393 s, `watchable`.
**Verdict: PASS for Alpha** (2026-10-06). Every slice 1 criterion met, AC-11 and AC-13 boundary drills deferred as noted above.
