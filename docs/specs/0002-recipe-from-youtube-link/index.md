# 0002. Recipe from a YouTube link: text first, grounded extraction

**Date**: 2026-09-30
**Status**: In Progress

Supersedes the *YouTube extraction* row, the *YouTube path* note and the *Gemini YouTube feasibility spike* section of [0001](../0001-stack-architecture/index.md). Everything else in 0001 stays in force. Duplicate handling, the save RPC and the `extraction_method` values follow [0003](../0003-data-model/index.md), which is their source.

## Summary

You paste a YouTube video or Short into the same "Add a link" box as web pages. Sotus then tries three places for the recipe, most reliable first. First the creator's recipe page linked in the description. Then the description text itself. Then (in a second slice, only after a new test run passes) what the video actually says and shows as text, for public videos up to 10 minutes, behind a switch you can turn off. Every ingredient, amount and number in a step must appear in real source text, or it is dropped, because the first spike showed Gemini inventing a cooking time and an ingredient when it wrote a recipe straight from watching.

## Requirements

**User stories**:
- As a signed in cook, I want to paste a YouTube cooking video or Short and get a clean recipe linked to it, so the recipe is no longer buried in the video.
- As a signed in cook, I want a clear message when the video has no usable recipe, so I never cook from an invented one.
- As a signed in cook, I want a video someone already added to open the existing recipe, so the library has no duplicates.

**Acceptance criteria**:

Slice 1 (link and description):

- **AC-1**: Pasting a YouTube link in any accepted form (`youtube.com/watch?v=`, `m.youtube.com/watch?v=`, `youtu.be/<id>`, `youtube.com/shorts/<id>`, each with or without extra parameters such as `t=` or `si=`) into the shared "Add a link" field runs the YouTube pipeline. A YouTube host link with no valid 11 character video ID shows "That YouTube link doesn't point to a video." and reserves no quota.
- **AC-2**: Only the canonical `https://www.youtube.com/watch?v=<id>` URL (or the bare ID, for the Data API) goes to any external service. The pasted URL is never fetched or forwarded.
- **AC-3**: When the library already holds a recipe for that video ID, the user lands on that recipe with the notice "This video is already in the library." and it is added to their collection (a `saved_recipes` row, even if they first imported it and later unsaved it). No quota is reserved and no external call is made.
- **AC-4**: When a link in the description leads to a page whose JSON-LD recipe passes the acceptance contract and shares a meaningful word with the video title, that recipe is saved with `extraction_method = youtube_recipe_page_jsonld` and `recipe_page_url` set. The recipe page shows "From the creator's recipe page".
- **AC-5**: Otherwise, when the video title plus description contains a recipe, it is saved with `extraction_method = youtube_description`. The recipe page shows "From the video description".
- **AC-6**: For description and transcript sources, nothing ungrounded is saved (rules in *Grounding*): an ingredient whose name is not in the source text is dropped; a quantity or unit not stated beside that ingredient in the source is left empty ("amount not given"); if any step contains a number not in the source, or mentions a dropped ingredient, nothing is saved and the outcome is `insufficient` / `ungrounded_step`. The contract counts (title, at least 2 ingredients, at least 1 step) are then checked again.
- **AC-7**: When no step found any cooking content, the outcome is `insufficient` with the message "This video doesn't include a written recipe we can read yet." When a step found partial content (for example ingredients but no steps), the message is "We found cooking content but not a full recipe." plus what was missing. Slice 1 never returns `not_a_recipe` for a YouTube link.
- **AC-8**: A video that is not found, private, deleted, live or upcoming shows "This video isn't available. It may be private, deleted or still live." with no Gemini call.
- **AC-9**: Every saved YouTube recipe keeps the canonical video URL, video ID, video title, channel name, thumbnail and extraction method, and the recipe page links to the video. The title is the JSON-LD name, else the extracted title, else the video title.
- **AC-10**: While the link is processed, the submit button is disabled with a spinner and the short label "Reading…", and the form's status region (a `role="status"` element mounted with the form) shows "Reading the video… this can take about a minute". The field cannot be submitted twice. The user ends on the recipe page or sees a clear message within 75 s; after a failure, focus returns to the link field. Pending, announcement and focus follow [0004](../0004-design-system-ui-foundation/index.md) *Pending, loading and feedback contract*.
- **AC-11**: Each paste that passes AC-1 and AC-3 reserves exactly one `extract_youtube` quota attempt before the first external call, whatever steps run after. Over the limit shows "You've reached today's limit for adding recipes. Try again tomorrow." The attempt row always ends with its outcome and reason.
- **AC-12**: A transient Gemini error (HTTP 429, 500, 503) is retried once only if its step budget still fits. If it still fails, the user sees "Our recipe reader is busy right now. Try again in a minute."
- **AC-13**: When two people paste the same new video at the same time, only one recipe is saved and both end on it; both users get a `saved_recipes` row for it (the winner is its `added_by`), and both attempts end as `recipe`.

Slice 2 (transcript, built only after spike 2 passes):

- **AC-14**: When `YOUTUBE_TRANSCRIPT=on`, the link and description give no recipe, and the video is public, not age or region restricted and at most 10 minutes long, Sotus writes out what is spoken and shown as text, extracts from that plus the title and description, and grounds the result per AC-6. A Short whose recipe is only spoken is saved with `extraction_method = youtube_transcript`, and the recipe page shows "From what the video says".
- **AC-15**: In the transcript step, a non food video returns `not_a_recipe` ("This link does not contain a recipe."). A cooking video where nothing usable is said or written returns `insufficient` ("We found cooking content but not a full recipe.").
- **AC-16**: A video longer than 10 minutes, or one that is age restricted, region restricted or unlisted, skips the transcript step. If the text steps found nothing, it returns `insufficient` with "This video is too long for us to watch. Paste one under 10 minutes, or a link to its recipe page." or "We can't watch this video, and its description has no recipe."
- **AC-17**: When `YOUTUBE_TRANSCRIPT` is unset or anything other than `on`, the transcript step never runs and every YouTube paste behaves exactly as slice 1 (AC-7's messages, no extra Gemini call).
- **AC-18**: When pass 1 stops at its output token limit, the cut off transcript is not used: no pass 2 runs, nothing is saved, and the outcome is `insufficient` / `transcript_cut_off` with "This video says more than we can read in one go. Paste a link to its recipe page instead."

## Decision

**Chosen option**: Option 3: Text first ladder (creator page, then description, then grounded transcript)

Extract YouTube recipes from real text in order of reliability: JSON-LD on a linked creator page, then the description through the YouTube Data API, then (slice 2, behind spike 2) a two pass Gemini transcript that is grounded like any text source. Gemini never writes a recipe straight from watching.

**Implementation skills**: `supabase` (`~/.claude/skills/supabase/`) · `supabase-postgres-best-practices` (`~/.claude/skills/supabase-postgres-best-practices/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `next-dev-loop` (`vercel/next.js`, `.claude/skills/next-dev-loop/`)

## Rationale

Reasoning, options, and spike 2 evidence: see [rationale.md](rationale.md).

## Feature design

### Pipeline (`src/lib/extraction/youtube/`)

One Server Action, `addRecipeFromLink`, shared with #6. It checks the host and hands YouTube hosts (`youtube.com`, `www.`, `m.`, `youtu.be`) to `extractFromYouTube`. Everything else goes to #6.

```
parse id ─ invalid → ingestion_failed / blocked_url          (no quota)
   │
open_existing_recipe('youtube', canonical_url) ─ found → saved to collection, redirect (no quota)
   │
YOUTUBE_API_KEY set? ─ no → metadata_unavailable, no attempt row          (no quota)
   │
reserve_ai_attempt('extract_youtube', canonical_url) ─ over → quota_exceeded
   │
Data API videos.list ─ error/timeout/unreadable duration → ingestion_failed / metadata_unavailable
   │                  ─ empty, live, upcoming → ingestion_failed / video_unavailable
   │
1. creator page: up to 2 description links → safeFetch → JSON-LD only → contract + title overlap
   │ no
2. description: Gemini on title + description → ground → contract     (skipped if description < 100 chars after removing URLs)
   │ no
3. transcript (slice 2): YOUTUBE_TRANSCRIPT=on? → watchable? → pass 1 watch → cut off? → pass 2 extract → ground → contract
   │ no
insufficient / not_a_recipe per AC-7, AC-15, AC-16
   │
sign payload → save_recipe (0003, also finishes the attempt) ─ out_created: false → already saved by someone else, redirect to it
failure paths: finish_ai_attempt(outcome, reason, summed tokens)
```

**Ladder rules**:
- A step ending `not_a_recipe`, `insufficient` or `invalid_model_output` falls through to the next step. A creator page fetch or JSON-LD failure also falls through.
- A step ending `provider_error` or `timeout` ends the ladder with that outcome; later steps are not tried.
- When the ladder ends with no recipe, the result is the most informative one seen, in this order: `not_a_recipe` from the transcript step (slice 2 only), then `transcript_cut_off`, then partial content (`missing_ingredients`, `missing_steps`, `ungrounded_step`, `no_stated_recipe`), then the skip reason (`video_not_watchable`, then `video_too_long`), then, when step 3 ran and ended `model_blocked` or `invalid_model_output`, that reason as `ingestion_failed`, then `no_written_recipe`.
- The attempt row stores that final reason. The user message comes from the *Outcome reasons and messages* table.
- Tokens from every Gemini call in the attempt are summed.

**Step budgets** (inside 0001's 75 s deadline and 10 s finish margin; a step that cannot finish before `deadline minus 10 s` is not started and the outcome becomes `ingestion_failed` / `timeout`):

| Step | Budget |
|---|---|
| Auth, dedup lookup, quota reservation | 2 s |
| Data API `videos.list` | 3 s, no retry |
| Creator page (up to 2 `safeFetch` calls **in parallel**) | 8 s |
| Gemini on description | 12 s |
| Transcript pass 1 (watch) | 25 s |
| Transcript pass 2 (extract) | 10 s |

Worst case 60 s, under the 65 s cutoff. A Gemini retry (0001: one, on 429/500/503) starts only if that step's **full** budget still fits before `deadline minus 10 s`; late in the ladder it usually will not, and the outcome is `provider_error`. The first spike's 7 s came from recipe output, not a verbatim transcript, so pass 1's budget and the 10 minute cap are provisional until spike 2 measures an 8 to 10 minute video. Spike 2 may lower the cap (never raise it) and correct the pass 1 and pass 2 budgets, as long as the worst case stays under 65 s.

**Output limits**: description step and pass 2 use 0001's `maxOutputTokens` 4096; a response cut off by the token limit (finish reason `MAX_TOKENS`) is `invalid_model_output`. Pass 1 uses 8192, and a pass 1 cut off by the limit is `insufficient` / `transcript_cut_off` (AC-18), checked from the finish reason before the text is parsed.

**Every route that renders the "Add a link" form** exports `maxDuration = 90` (a Server Action runs under the route that hosts it).

**Link parsing** (`parse-youtube-url.ts`, pure): accept `https` or `http`; hosts `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`. ID from `v` query parameter (`/watch`), first path segment (`youtu.be`), or the segment after `/shorts/`. ID must match `^[A-Za-z0-9_-]{11}$`. Everything else about the URL is discarded. Embed, live, playlist only and channel links are rejected (`blocked_url`).

**Data API call** (`youtube-metadata.ts`, `server-only`): plain `fetch` with the step's `AbortSignal` to the fixed URL `https://www.googleapis.com/youtube/v3/videos?id=<id>&part=snippet,contentDetails,status&key=<YOUTUBE_API_KEY>&fields=items(snippet(title,description,channelTitle,thumbnails,liveBroadcastContent),contentDetails(duration,regionRestriction,contentRating/ytRating),status/privacyStatus)`, parsed by a zod schema. The host is fixed, so it does not go through `safeFetch`. The request URL carries the key, so no log or error path ever prints it; errors log only the HTTP status and the video ID. Duration: ISO 8601 parsed to seconds. The thumbnail is not taken from the response: it is built from the ID (see *Data model sketch*).

**Watchability** (decided from metadata, before any Gemini call):

| Condition | Effect |
|---|---|
| `items` empty | `ingestion_failed` / `video_unavailable` |
| `liveBroadcastContent` is `live` or `upcoming` | `ingestion_failed` / `video_unavailable` |
| `privacyStatus` not `public` | transcript skipped (`video_not_watchable`) |
| `ytRating = ytAgeRestricted` or any `regionRestriction` | transcript skipped (`video_not_watchable`) |
| duration missing or unreadable | `ingestion_failed` / `metadata_unavailable` |
| duration read and over 600 s (`TRANSCRIPT_MAX_SECONDS`, a constant spike 2 may lower) | transcript skipped (`video_too_long`) |

The watchability skips only matter when the transcript step is switched on. With `YOUTUBE_TRANSCRIPT` off, the ladder ends after step 2 and the end reason is slice 1's `no_written_recipe` (AC-17), whatever the metadata says.

**Step 1, creator page** (`creator-page.ts`): take `http(s)` URLs from the description in order of appearance. Drop hosts on a fixed deny list (`youtube.com`, `youtu.be`, `instagram.com`, `tiktok.com`, `facebook.com`, `fb.com`, `x.com`, `twitter.com`, `threads.net`, `pinterest.*`, `amazon.*`, `amzn.to`, `patreon.com`, `linktr.ee`, `bit.ly`, `geni.us`, `spotify.com`, `discord.gg`), and drop duplicates. Rank the rest: links whose path has at least one segment beyond `/` come first (a recipe page, not a home page), otherwise keep description order. Fetch the top 2 **in parallel** through `safeFetch` and #6's JSON-LD reader only (no Gemini on page text here). Of those that pass the acceptance contract, accept the higher ranked one whose JSON-LD `name` shares at least one token with the video title (tokens as in *Grounding*, minus the checked in `STOP_WORDS` constant, English). A fetch or JSON-LD failure is not an outcome; the attempt's JSON log line records how many links were tried and failed, and the ladder moves on.

**Step 2, description**: Gemini with the *Provider response schema* below and #6's text prompt, input = video title + description (cut to 60,000 characters). Grounding source = the same title + description, cleaned as in *Grounding*.

**Provider response schema** (the shared contract with #6; 0001's rules on what Gemini's schema may use still apply): exactly `outcome` (`recipe` | `not_a_recipe` | `insufficient`), optional `reason`, `title`, `ingredients[{ name, quantity?, unit? }]`, `steps[string]`. No times, servings, notes or descriptions, so nothing ungroundable can be produced. Accepted recipe limits (0001's accepted recipe schema): title at most 120 characters (a longer extracted title is cut at the last word boundary before 120), ingredient name at most 120, unit at most 20, step at most 1000, at most 60 ingredients and 40 steps. A value over its limit other than the title is `invalid_model_output`.

**Step 3, transcript** (slice 2, `transcript.ts`, `server-only`):
- *Switch*: `YOUTUBE_TRANSCRIPT` is read per call (like `YOUTUBE_API_KEY`), server only. Exactly `on` runs the step; unset or any other value skips it (AC-17). It is not validated at boot, because off is a valid state.
- *Model and settings*: the same `GEMINI_MODEL`. Pass 1 has its own pinned `GEMINI_TRANSCRIPT_SETTINGS` beside `GEMINI_SETTINGS` in `src/lib/ai/gemini.ts`. Pass 2 uses `GEMINI_SETTINGS` unchanged. Both get 0001's one transient retry, only when the full step budget still fits.

  | Setting (pass 1) | Value |
  |---|---|
  | `maxOutputTokens` | 8192 |
  | `temperature` | 0 |
  | `thinkingConfig.thinkingBudget` | 0 (thinking tokens count against the output limit and would fake cut offs) |
  | `mediaResolution` | `MEDIA_RESOLUTION_LOW` or left unset (the API default), whichever spike 2 pins |
  | `responseMimeType` / schema | none, plain text |
  | video input | one `fileData` part, `fileUri` = canonical URL; no `videoMetadata` (default sampling, no clipping) |

- *Pass 1 (watch)*: a new `transcribeVideo` in `gemini.ts` sends the video part plus the prompt `TRANSCRIPT_PROMPT` from `src/lib/extraction/youtube/transcript-prompt.ts` (exact wording written in build plan task 11, so the spike and the app run the same text). The prompt must say: write out word for word only what is said and what appears as text, never describe, summarise or infer from appearance; keep the video's own language, never translate; write every number as digits (`25`, `1/2`); put one spoken sentence per line; list each piece of on screen text once, even if it stays on screen or repeats; leave out channel names, watermarks, "subscribe" and other overlays that are not about the food; write `NONE` for an empty section. The answer is plain text in exactly this shape:

  ```
  SPOKEN:
  <what is said, word for word, or NONE>
  ON SCREEN:
  <text shown on screen, one item per line, or NONE>
  FOOD: yes | no
  ```

  `parse-transcript.ts` (pure, covered by `pnpm check:extraction`) reads it: the three markers must appear once each, in this order, else `invalid_model_output`. `NONE` (any case, alone in its section) means empty. `FOOD` must be `yes` or `no`.
- *Finish reasons*: pass 1 checks finish reason `MAX_TOKENS` first and returns `insufficient` / `transcript_cut_off` (AC-18); it does not go through the `max_tokens` row of `classifyGeminiResponse`. Every other response check reuses `classifyGeminiResponse`: a prompt block, `SAFETY`, `RECITATION` (likely on word for word transcripts of songs or scripted speech) and the other blocked reasons become `model_blocked`; an empty answer becomes `invalid_model_output`. Both end the ladder per *Ladder rules*.
- *Not food*: `FOOD: no` → `not_a_recipe`, whatever the sections hold. No pass 2.
- *Empty transcript*: `FOOD: yes` and both sections empty → `insufficient` / `no_stated_recipe`. No pass 2.
- *Pass 2 (extract)*: `generateRecipe` with the provider response schema and #6's text prompt, on the spoken text + on screen text + title + description (each labelled, together cut to 60,000 characters). Grounding source = those four, cleaned as in *Grounding*. Segments: lines for all four (the prompt puts one spoken sentence per line, so no sentence splitter is needed). Pass 2's `outcome` is trusted as given.
- *Logging*: the attempt's JSON log line records the spoken and on screen character counts, the media resolution and pass 1's finish reason. The transcript text itself is never logged or stored.

**Grounding** (`grounding.ts`, pure, shared with #6's page text path):
- *Clean the source*: remove URLs, `#hashtags`, and lines that start with a timestamp (`0:25`, `1:02:10`, `(3:45)`), then lowercase, Unicode NFKC, vulgar fractions to `a/b`, collapse whitespace. Split into **segments**: lines for descriptions, sentences for transcripts.
- *Tokens*: whole words of letters only, run through one `singular()` function (drops a final `es` after `s`, `x`, `ch`, `sh`, else a final `s` not preceded by `s`, `u` or `i`; words under 4 letters unchanged). The same function applies to source and output. Matching is token equality, never substring.
- *Numbers*: digits, decimals (`.` or `,`), fractions, mixed numbers (`1 1/2`), ranges (`10-12` is two numbers), and the words `half`, `quarter`, `one` to `twelve`, each compared by value (`1/2` = `½` = `0.5` = `half`).
- *Ingredient name*: every token of 3 or more letters in the name appears as a token in the source; otherwise drop the ingredient.
- *Quantity and unit*: the quantity's number and the unit's token both appear in **one segment** that also contains the ingredient name's last token (its head word, for example `miso` in `white miso`). Otherwise both quantity and unit are left empty.
- *Step*: strip a leading enumeration (`1.`, `Step 2:`). If any number in the step does not appear in the source by value, or the step contains the head word of a dropped ingredient, the whole result is `insufficient` / `ungrounded_step`. Steps are never silently dropped.
- Then the acceptance contract counts are checked again. Failing them is `insufficient` with the missing part as reason.
- Grounding returns the drop counts (ingredients dropped, amounts cleared) for the JSON log line.

**Title**: JSON-LD `name` → extracted `title` → Data API `snippet.title`, the first that is not blank after trimming.

**Duplicate lookup**: `open_existing_recipe('youtube', <canonical URL>)` (0003) under the user's session. It returns the existing recipe ID and adds it to the caller's collection. Found → `redirect('/recipes/<id>?notice=already-in-library')`.

**Save and finish in one call**: `save_recipe(attempt_id, payload, signature, input_tokens, output_tokens)` (0003) inserts the recipe, ingredients and steps and finishes the attempt as `recipe` with the summed tokens, in one transaction. A crash can then never leave a saved recipe beside an unfinished attempt. The payload is the JSON text of the content plus `source_title` and `source_channel_title` (from the Data API), signed on the server with `src/lib/recipes/sign-payload.ts` (0003 *Signed publication*). Owner and source come from the session and the attempt. Failure paths call `finish_ai_attempt` alone.

**Race on save**: handled inside `save_recipe`. When another paste of the same video won, it returns `{ out_recipe_id, out_created: false }`, has already saved that recipe to the caller's collection and finished the attempt as `recipe` / `already_saved`. The action redirects to it with the notice above. No `unique_violation` reaches the app. The first saved recipe for a video is the canonical one everyone gets; no user can change it (0003), and nobody can extract the same video again.

**Error edge**: the action's catch all that turns an unexpected throw into `ingestion_failed` must rethrow Next.js redirect errors (`unstable_rethrow` or equivalent), or the success redirect is swallowed.

**Pending UI**: the shared "Add a link" form is a client component using `useActionState`. The pending text depends on the host typed, checked with a shared pure `isYouTubeHost(url)` helper that the server router uses too: for YouTube hosts the button label is "Reading…" and the form's stable status region shows "Reading the video… this can take about a minute" (0004: the long text never goes in the button). The field keeps the pasted link after any failure, and focus returns to it. The invalid link message ("That YouTube link doesn't point to a video.") is a field validation error: `aria-invalid` on the input, the message in `FieldError`, read through `aria-describedby`. Every other failure message renders under the field as `Alert tone="problem" announce="assertive"` (no red), not linked to the input, so it is announced once.

### Data model sketch

#3 builds these in the `recipes` table migration; [0003](../0003-data-model/index.md) holds the full model and wins on any detail. #7 adds no migration of its own.

| Column | Type | Null | Rule |
|---|---|---|---|
| `id` | uuid | PK | |
| `added_by` | uuid → `profiles` | yes | N:1, set to `auth.uid()`; attribution only, no edit rights; null only after that account is deleted |
| `title` | text | no | per *Title* above |
| `source_kind` | enum `web` \| `youtube` | no | |
| `source_url` | text | no | YouTube: canonical watch URL |
| `youtube_video_id` | text | generated | generated from `source_url` by the database; not null exactly when `source_kind = youtube`; unique, constraint `recipes_youtube_video_id_key` |
| `source_title` | text | yes | video title (Data API) |
| `source_channel_title` | text | yes | channel name, YouTube only |
| `source_metadata_fetched_at` | timestamptz | yes | set by `save_recipe` for YouTube recipes; drives the pre launch refresh or clear job |
| `extraction_method` | enum `web_jsonld` \| `web_model` \| `youtube_recipe_page_jsonld` \| `youtube_description` \| `youtube_transcript` | no | `youtube_*` exactly when `source_kind = youtube` |
| `recipe_page_url` | text | yes | only when `extraction_method = youtube_recipe_page_jsonld` |
| `created_at` | timestamptz | no | default `now()` |

No thumbnail column: the thumbnail is derived when rendering as `https://i.ytimg.com/vi/<youtube_video_id>/hqdefault.jpg` (fixed host, already in 0001's `images.remotePatterns`), so no Data API image URL is stored.

`save_recipe` takes the attempt ID (see *Save and finish in one call*).

Unchanged from #3 and 0001: `recipe_ingredients` (N:1 recipe; name, optional quantity, optional unit), `recipe_steps` (N:1 recipe), and the attempt table (`kind = extract_youtube`, `source_url` = canonical URL). No description, transcript or page text is stored anywhere.

### State transitions

Attempt row (0001): `started` → `recipe` | `not_a_recipe` | `insufficient` | `ingestion_failed`, set by `finish_ai_attempt`. `started` older than 2 minutes reads as `interrupted`. No new states.

### API surface

| Action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `addRecipeFromLink` | Server Action (shared with #6) | `url: string` (req, trimmed, ≤ 2048, http/https) | redirect to `/recipes/<id>` (new or existing), or `{ outcome, reason, message }` | signed in (`getUser()`); none → redirect to sign in | `blocked_url`, `video_unavailable`, `metadata_unavailable`, `quota_exceeded`, `provider_error`, `timeout`, `invalid_model_output`, `insufficient`, `not_a_recipe` |
| `videos.list` (outbound) | GET, fixed host | `id`, `part`, `fields`, `key` | snippet, contentDetails, status | `YOUTUBE_API_KEY` | non 2xx, timeout or unreadable duration → `metadata_unavailable` |
| Gemini `generateContent` (outbound) | SDK | text, or canonical URL as file input (pass 1) | provider response, or pass 1 plain text | `GEMINI_API_KEY` | 429/500/503 → one retry → `provider_error`; pass 1 `MAX_TOKENS` → `transcript_cut_off` |

### Outcome reasons and messages

| Outcome | Reason | Message |
|---|---|---|
| `ingestion_failed` | `blocked_url` | That YouTube link doesn't point to a video. |
| `ingestion_failed` | `video_unavailable` | This video isn't available. It may be private, deleted or still live. |
| `ingestion_failed` | `metadata_unavailable` | We couldn't reach YouTube just now. Try again in a minute. |
| `ingestion_failed` | `quota_exceeded` | You've reached today's limit for adding recipes. Try again tomorrow. |
| `ingestion_failed` | `provider_error` | Our recipe reader is busy right now. Try again in a minute. |
| `ingestion_failed` | `timeout` | This took too long. Try again, or paste a link to the recipe page. |
| `ingestion_failed` | `invalid_model_output` | Something went wrong reading this video. Try again. |
| `ingestion_failed` | `save_failed` (0003: Sotus's own save step failed) | Something went wrong saving this recipe. Try again. |
| `insufficient` | `no_written_recipe` (slice 1 end) | This video doesn't include a written recipe we can read yet. |
| `insufficient` | `video_too_long` | This video is too long for us to watch. Paste one under 10 minutes, or a link to its recipe page. |
| `insufficient` | `transcript_cut_off` (slice 2 only) | This video says more than we can read in one go. Paste a link to its recipe page instead. |
| `ingestion_failed` | `model_blocked` (slice 2, when step 3 ends the ladder) | We couldn't read this video. Paste a link to its recipe page instead. |
| `insufficient` | `video_not_watchable` | We can't watch this video, and its description has no recipe. |
| `insufficient` | `missing_ingredients` / `missing_steps` / `no_stated_recipe` | We found cooking content but not a full recipe. (plus what was missing) |
| `insufficient` | `ungrounded_step` | We found a recipe, but some steps weren't stated clearly in the video, so we didn't save it. |
| `not_a_recipe` | `not_a_recipe` (slice 2 only) | This link does not contain a recipe. |

When slice 2 is live and switched on, `no_written_recipe` is not reached: every video the transcript step skips has its own reason above. With the switch off, slice 1's `no_written_recipe` stays the end reason. `transcript_cut_off` goes into `ATTEMPT_REASONS` first and then into `messages.ts`, per `src/lib/ai/AGENTS.md`; `model_blocked` already exists and gets a `youtube:` message.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| `addRecipeFromLink` | route: YouTube or web | host of the `url` input |
| | video ID, canonical URL | parsed from `url`, then rebuilt |
| | existing recipe ID (duplicate) | `open_existing_recipe` before reserving; `save_recipe` returning `out_created: false` after a race |
| | quota decision, attempt ID | `reserve_ai_attempt` (0001, #3) |
| | video title, description, channel, duration, availability | Data API `videos.list` |
| | candidate recipe links | URLs in the description, minus the deny list |
| | recipe from creator page | #6's JSON-LD reader on `safeFetch` HTML |
| | title overlap check | JSON-LD `name` vs `snippet.title` |
| | recipe from description or transcript | Gemini provider response, after grounding |
| | grounding source text | title + description (step 2); plus pass 1's spoken and on screen sections (step 3) |
| | transcript step on or off | `YOUTUBE_TRANSCRIPT` env var, read per call |
| | transcript too long | Data API duration vs `TRANSCRIPT_MAX_SECONDS` (600, may be lowered by spike 2) |
| | spoken text, on screen text, food flag | `parse-transcript.ts` on pass 1's plain text |
| | transcript cut off | pass 1 finish reason `MAX_TOKENS` |
| | pass 1 media resolution, thinking budget | `GEMINI_TRANSCRIPT_SETTINGS`, pinned from spike 2's evidence |
| | `title` | JSON-LD `name` → extracted `title` → `snippet.title` |
| | `extraction_method`, `recipe_page_url` | the step that produced the recipe; the accepted link |
| | `added_by`, `source_kind`, `source_url` | `auth.uid()` and the attempt, inside `save_recipe` |
| | outcome, reason, tokens | *Ladder rules*; Gemini `usageMetadata` summed across calls |
| | user message | *Outcome reasons and messages* table, keyed by outcome and reason |
| Recipe page (#8) | "From …" provenance line | `extraction_method` (+ `source_kind`) |
| | video link, title, channel | `source_url`, `source_title`, `source_channel_title` |
| | thumbnail | derived from `youtube_video_id` (`i.ytimg.com/vi/<id>/hqdefault.jpg`) |
| | "already in the library" notice | `notice=already-in-library` query parameter |

### Key invariants

- The pasted URL never leaves the parser. Only the video ID and canonical URL are used after it.
- No external call before a successful quota reservation. Parse failures, duplicates and a missing `YOUTUBE_API_KEY` reserve nothing.
- Exactly one attempt row per reserved paste. It is finished by the save RPC or `finish_ai_attempt`, unless the function is killed first, in which case it reads as `interrupted` (0001).
- One recipe per `youtube_video_id`, enforced by `recipes_youtube_video_id_key`.
- A saved description or transcript recipe contains no ingredient name token, and no quantity or unit, absent from its cleaned grounding source (quantity and unit in the same segment as the ingredient), and no step number absent from it.
- A saved recipe always passes 0001's acceptance contract after grounding.
- Description links are user supplied URLs: only `safeFetch` fetches them.
- Gemini never receives a video URL other than the canonical one, and never writes a recipe from pass 1 directly.
- A cut off pass 1 transcript is never extracted from or grounded against.
- With `YOUTUBE_TRANSCRIPT` not `on`, no Gemini call ever gets a video as input.

### Security model

- Signed in users only; the action identifies the user with `supabase.auth.getUser()`.
- RLS from #3: every signed in user reads every recipe; inserts only through the signed save RPC, with `added_by = auth.uid()` as attribution only; recipes are read only for users (0003). The attempt table follows 0001 (own rows readable, writes only through the `SECURITY DEFINER` functions).
- `YOUTUBE_API_KEY` and `GEMINI_API_KEY` are read only in `server-only` modules. `GEMINI_API_KEY` is validated where read and throws when absent (like `src/lib/supabase/env.ts`). `YOUTUBE_API_KEY` is read lazily, so web links keep working without it: a YouTube paste checks it after the duplicate lookup and before `reserve_ai_attempt`, and when it is missing returns `metadata_unavailable` with no attempt row and no quota spent. `YOUTUBE_API_KEY` is restricted in Google Cloud to the YouTube Data API v3, and never logged (it sits in the request URL).
- Description text and transcripts are untrusted third party input (prompt injection is possible). Gemini has no tools, answers only through the response schema, and every value passes grounding and the contract. The worst case is a wrong canonical recipe in the shared library, correctable only by a future admin path (0003 launch gate); #13 lets each user adjust their own version.
- Description links take the full `safeFetch` guard (SSRF, redirects, size, time). At most 2 per paste.
- No personal data beyond what 0001 already stores. No compliance scope. The YouTube API Services policies limit how long API data (video title, channel name) may be kept; accepted for a non commercial demo, to be checked before any public launch (Follow-up).

### Configuration required

- `YOUTUBE_API_KEY`: server only. An API key in the same Google Cloud project as Gemini, restricted to the YouTube Data API v3. Add it to Vercel (all three environments), `.env.local` and `.env.example`. Prerequisite: enable the YouTube Data API v3 in that project.
- `YOUTUBE_TRANSCRIPT` (slice 2): server only, `on` to enable the transcript step, anything else (or unset) keeps slice 1 behaviour. Add it to `.env.example` (empty), set it to `on` per Vercel environment when slice 2 ships. Turning it off is an env change plus a redeploy, no code change.

### Critical test scenarios

- Happy path, creator page: a recipe video whose description links a JSON-LD recipe site saves with `youtube_recipe_page_jsonld` and the page URL, verifies **AC-4**, **AC-9**
- Happy path, description: a Short with the full recipe in its description saves with `youtube_description`, verifies **AC-5**, **AC-9**
- Grounding: a description with chapter timestamps (`0:25 Bake`) and a model step "bake 25 minutes" the text never states ends `insufficient` / `ungrounded_step`; a model amount stated on a different line from its ingredient is saved empty; "oil" is not grounded by "boil", verifies **AC-6**
- Link forms: `youtu.be/<id>?si=…`, `m.youtube.com/watch?v=<id>&t=30` and `/shorts/<id>` all resolve to the same canonical URL; `youtube.com/@channel` shows the invalid link message with no attempt row, verifies **AC-1**, **AC-2**
- Duplicate and race: pasting a saved video opens it with the notice, adds it to the paster's collection and creates no attempt row; two sessions pasting a new video at once end on one recipe that is in both collections, verifies **AC-3**, **AC-13**
- Unavailable: a deleted video ID shows the unavailable message and its attempt row has no token counts, verifies **AC-8**
- Failure, provider: Gemini returning 503 twice shows the busy message and the attempt row ends `ingestion_failed` / `provider_error`, verifies **AC-12**
- Quota: the 21st paste of the day shows the limit message, verifies **AC-11**
- Auth: a signed out request to `addRecipeFromLink` is redirected to sign in and no attempt row is created, verifies **AC-11**
- Slice 2: a spoken only recipe Short saves with `youtube_transcript`; a non food video shows the no recipe message; a 12 minute video with no text recipe shows the too long message, verifies **AC-14**, **AC-15**, **AC-16**
- Slice 2 switch: with `YOUTUBE_TRANSCRIPT` unset, the same spoken only Short ends `insufficient` / `no_written_recipe` and the attempt row has only description step tokens (or none), verifies **AC-17**
- Slice 2 cut off: `parse-transcript.ts` cases in `pnpm check:extraction` (markers missing, out of order, `NONE`, bad `FOOD` line), plus a dev only `GEMINI_TEST_FAILURE=transcript-max-tokens` that returns finish reason `MAX_TOKENS` and shows the cut off message, verifies **AC-18**

## Build plan

Skateboard: slice 1 is a usable YouTube feature on its own (creator page plus description, grounded). Slice 2 grows it only after evidence says it's safe. Prerequisites: #3 has built the `recipes` columns above, the save RPC and the quota functions, and #6 has built `safeFetch`, the JSON-LD reader, the provider schema, the contract and the "Add a link" form.

**Slice 1: text sources**

1. [x] Enable the YouTube Data API v3, create the restricted `YOUTUBE_API_KEY`, add it to Vercel and `.env.local`, list it in `.env.example`, validate it in a `server-only` env reader, satisfies **AC-5**
2. [x] `parse-youtube-url.ts` and `isYouTubeHost` (pure) plus host routing in `addRecipeFromLink`, satisfies **AC-1**, **AC-2**
3. [x] `open_existing_recipe` before reservation, and the `out_created: false` redirect after `save_recipe`, satisfies **AC-3**, **AC-13**
4. [x] `youtube-metadata.ts`: `videos.list` with zod parsing, the watchability table, the step budget, and key free error logging, satisfies **AC-8**, **AC-9**, **AC-11**
5. [x] `grounding.ts` (pure): source cleaning, tokens and `singular()`, number values, names, same segment quantity and unit, step numbers and `ungrounded_step`, then recheck the contract; reuse it in #6's page text path, satisfies **AC-6**
6. [x] `creator-page.ts`: link harvest, deny list, ranking, 2 parallel `safeFetch` + JSON-LD, title overlap with `STOP_WORDS`, satisfies **AC-4**
7. [x] Description step: Gemini with the provider response schema on title + description, output limits, grounding, the title rule, one transient retry within budget, satisfies **AC-5**, **AC-6**, **AC-12**
8. [x] `extractFromYouTube` orchestration: reserve, the ladder rules, save and finish through #3's RPC with the YouTube columns and attempt ID, failure finish with summed tokens, redirect rethrow, the outcome and message table, satisfies **AC-7**, **AC-9**, **AC-11**
9. [x] Pending state and messages in the shared form; `maxDuration = 90` on each route hosting it; "From …" provenance line, derived thumbnail and the already in library notice on the recipe page, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-9**, **AC-10**
10. [x] `/check verify` slice 1 against AC-1 to AC-13 on real videos (one with a creator page, one with a description recipe, one with neither, one deleted). PASS for Alpha on 2026-10-06 ([verify.md](verify.md)); the AC-11 quota boundary and AC-13 two user race drills were deferred by the engineer.

**Slice 2: grounded transcript (gated)**

11. Spike 2: write `transcript-prompt.ts` and `parse-transcript.ts` (they ship as is in task 12), then `scripts/spike-youtube-transcript.ts` (package script `spike:youtube-transcript`, throwaway, needs `.env.local`) runs pass 1 + `parse-transcript.ts` + pass 2 + the real `grounding.ts` and contract, with the prompt and settings this spec names. It runs as `node --conditions=react-server --experimental-strip-types --env-file=.env.local …` so `server-only` imports load as an empty module and the script can use `gemini.ts` directly, satisfies **AC-14**, **AC-18**.
    - *Videos (7)*: 0001's five from `scripts/spike-gemini-youtube.ts`, with video 3's expected outcome now `insufficient` (nothing is stated, so nothing may be grounded), plus a Short whose recipe is only spoken (expected `recipe`) and an 8 to 10 minute recipe video (expected `recipe`). Expected outcomes for the two new videos are written into the script before the first run.
    - *Reference sheet*: before the first run, you write one sheet per video in the evidence section: every ingredient, amount, unit and number that the video says or shows. A saved value is grounded when it has the same meaning as an entry on the sheet: unit abbreviations and full names count as equal (`tbsp` = `tablespoon`), digits and number words count as equal, a converted unit does not count. You are the reviewer.
    - *Runs*: 3 completed runs per video at each of two media resolutions (`MEDIA_RESOLUTION_LOW` and unset), 42 in all. A run lost to a 503 is retried and does not count, as in 0001.
    - *Pass bar*, per resolution, every one must hold: (1) grounding: no saved ingredient, amount, unit or step number is missing from the reference sheet; one invented value fails that resolution; (2) outcome: every run lands on its expected outcome; (3) shape: every `recipe` run passes the contract; (4) latency, with headroom under the 25 s and 10 s budgets: pass 1 at most 20 s and pass 2 at most 8 s on every run, including the 8 to 10 minute video; (5) token headroom: pass 1 output at most 4096 tokens (half the limit) on every run.
    - *Cost*: recorded for information only; it is not part of the pass bar.
    - *Pick*: pin the cheaper resolution that passes into `GEMINI_TRANSCRIPT_SETTINGS`. If grounding, outcome and shape pass but the longest video misses the latency or token headroom bar, lower `TRANSCRIPT_MAX_SECONDS` to the longest tested length that fit and update this spec; that is not a fail.
    - *Fail*: if no resolution passes on grounding, outcome or shape, run the spike once more on a stronger Gemini model (named in the evidence), same videos and bar. If that passes, record the model choice here before task 12 (a second model would need its own setting). If it fails too, stop: slice 1 stays the shipped feature and you decide with `/scope` whether AC-14 to AC-18 move to a later idea.
    - *Evidence*: record in [rationale.md](rationale.md) under *Evidence: spike 2*: model ID and API version, a SHA-256 of `TRANSCRIPT_PROMPT`, the media resolution per run, the reference sheets, per call latency, input and output tokens, cost per call at that day's paid rate, transcript lengths, finish reasons, the manual grounding review per video, and the verdict.
12. Transcript step: `YOUTUBE_TRANSCRIPT` switch, `GEMINI_TRANSCRIPT_SETTINGS` and `transcribeVideo`, `parse-transcript.ts` cases in `check:extraction`, the finish reason handling, the cut off, not food and empty transcript branches, the `youtube:model_blocked` message, pass 2 with grounding, the watchability skips at `TRANSCRIPT_MAX_SECONDS`, the `transcript_cut_off` reason and message, and the `transcript-max-tokens` dev failure, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**, **AC-18**
13. Wire step 3 into the ladder after step 2, behind the switch; `finalLadderReason` takes the slice 2 order (switch on) and keeps `no_written_recipe` (switch off); add `YOUTUBE_TRANSCRIPT` to `.env.example`, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**
14. `/check verify` slice 2 against AC-14 to AC-18 (a spoken only Short, a non food video, a 12 minute video, the same Short with the switch off, the cut off drill); then set `YOUTUBE_TRANSCRIPT=on` in Vercel

## Consequences

**Positive**:
- Every saved value traces to real text, which directly answers the spike failure (the made up time and mustard).
- Slice 1 needs no new spike and reuses #6's `safeFetch`, JSON-LD reader, contract and form.
- A creator page with JSON-LD gives exact amounts for free, with no Gemini call.
- The Data API is official and reliable from Vercel, unlike transcript scraping. One call gives metadata and availability together, so oEmbed is dropped.
- The dedup check saves quota and keeps the shared library clean.
- `grounding.ts` also strengthens #6: its page text path gets amount and step number checks too.

**Negative / tradeoffs**:
- **The demo story shrinks in slice 1.** A Short whose recipe is only spoken returns "doesn't include a written recipe" until slice 2 ships. Slice 2 itself depends on spike 2.
- **Visual only recipes are out for good.** A video where nothing is said or written can never produce a recipe (0001's video 3 case). That is the price of never inventing one.
- **Pass 1 is still model output.** A transcript can mishear or invent words, and grounding only checks against it. Spike 2's manual grounding review is the only measure of this.
- **Strict grounding rejects some honest recipes.** A step saying "bake 25 minutes" when a description says "twenty five" fails (number words above twelve are not matched); pass 1 writes numbers as digits, so this mostly hits description text. One ungrounded step rejects the whole recipe rather than saving a version that cooks wrong. Amounts written on a different line from their ingredient are cleared.
- **First writer wins.** A weak first extraction of a video stays the library's canonical recipe for it; no user can change it (0003), only a future admin path. #13 lets each user adjust their own version.
- **Unavailable videos cost quota.** The Data API call comes after the reservation (the AGENTS.md rule), so pasting a deleted video uses one of the 20 daily attempts.
- **Title overlap can reject the right page** when the creator's page title and video title share no word (for example "Grandma's Sunday Special" vs "Best Lasagna Ever").
- **A new key and a new Google API** to enable, restrict and rotate. The Data API's free daily quota is far above 300 attempts a day, but it is one more quota that can run out.
- **Non English videos** produce a recipe in the source language or `insufficient`, never a translation.
- **Up to 3 Gemini calls per paste in slice 2** (description, pass 1, pass 2), still one quota attempt. The 20 per user and 300 app wide limits bound cost.
- **The 10 minute cap leaves out many full length cooking videos.** Those still work through the creator page or description; otherwise they get the too long message. Spike 2 can only lower the cap.
- **Dense videos lose out to the cut off rule.** A video that talks fast for the full 10 minutes may hit pass 1's token limit and end `transcript_cut_off` rather than save a recipe that might be missing its last steps.
- **A plain text pass 1 needs its own parser** instead of the SDK's schema check: one more pure module and its test cases.
- **One more env var** (`YOUTUBE_TRANSCRIPT`) to set per Vercel environment, and a feature that can be silently off if it's forgotten.

**Neutral**:
- #3's `recipes` migration must include the columns and constraints above. #8's recipe page must render the provenance line and the notice.
- `addRecipeFromLink` becomes the one entry point for both sources. #6 owns its web half.
- The deny list is a code constant; changing it is a code change.

## Follow-up

- [x] Mark 0001's *YouTube extraction* row, *YouTube path* note and spike section as superseded by this spec, and tick its "Owed by the failed spike" follow-up.
- [x] `/architect data model` (#3): done in [0003](../0003-data-model/index.md), which also changed duplicate handling (saved to the importer's collection, race settled in `save_recipe`) and renamed the `extraction_method` values.
- [x] `/architect recipe from a web page link` (#6): done in [0006](../0006-recipe-from-web-page-link/index.md), which built the host routing, the JSON-LD reader, the provider schema and `grounding.ts` reuse.
- [x] #8 Recipe page: the "From …" provenance line, derived thumbnail and `notice=already-in-library` message shipped with slice 1's UI (build plan task 9). The rest of #8 stays with its own feature.
- [ ] #10 Extraction error tracking: read the new reasons (`video_unavailable`, `metadata_unavailable`, `no_written_recipe`, `no_stated_recipe`, `ungrounded_step`, `video_too_long`, `video_not_watchable`, `transcript_cut_off`, `already_saved`, `save_failed`).
- [ ] Before any public or commercial launch: check the YouTube API Services Developer Policies on storing API data (video title, channel name) and on showing creator recipes in a shared library; refresh or drop the stored fields if required.
- [ ] Run spike 2 before slice 2 (build plan task 11).
- [x] For `/sync`: `YOUTUBE_API_KEY` is in root `AGENTS.md`'s env rules, and the YouTube skills and MCP servers are listed under `Declined:`.
- [ ] For `/sync`, when slice 2 ships: add `YOUTUBE_TRANSCRIPT` (read per call, `on` to enable) beside `YOUTUBE_API_KEY` in root `AGENTS.md`, and the `spike:youtube-transcript` command.
- [ ] Revisit the 10 minute cap and the pass 1 and pass 2 budgets with spike 2's latency and token numbers (build plan task 11, *Pick*).
- [ ] Run the deferred slice 1 drills (AC-11 21st paste, AC-13 two user race) before #7 is marked done.
