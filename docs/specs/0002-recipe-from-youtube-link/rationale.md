# 0002. Recipe from a YouTube link: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

Feature #7 is the headline demo: paste a YouTube video or Short, get a clean recipe. Spec 0001 planned to have Gemini read the video straight from its URL, conditional on a feasibility spike. The spike ran on 2026-09-27 and failed (evidence in [0001 rationale.md](../0001-stack-architecture/rationale.md), *Evidence: Gemini YouTube spike*):

- Classification was reliable: 15 of 15 runs landed on the expected outcome.
- Speed and schema were fine: about 7 s at most, schema accepted.
- Grounding failed on video 2: a cooking time the video never gave, and mustard, inferred from the colour of a glaze. The output looked like a real recipe, so nothing from the output alone showed it was wrong.
- Shape failed once: 18 ingredients and 0 steps.

The spike's own reading: the invented values come from the *writing* step, not the *watching* step. Text sources can be grounded (every value checked against the source text); a model writing straight from video cannot.

Forces: the scope's "done when" forbids a made up recipe; one builder on a course timeline, Skateboard approach; Vercel servers are often blocked from YouTube's caption endpoints; 0001's rules (one door for URLs, reserve before cost, one 75 s deadline, one acceptance contract) stay in force; Gemini was sometimes unavailable in an earlier run (5 of 12 calls lost to 503).

## Options considered

### Option 1: Gemini video, tighter prompt, rerun the spike

Keep 0001's design; strengthen the prompt ("only what is stated") and rerun.

**Pros**: the best demo when it works (visual only recipes too); no new API or key.
**Cons**: nothing to ground against, so a pass on 5 videos says little about arbitrary links; the failure looks exactly like success; a prompt is a request, not a guarantee.

### Option 2: Description only (YouTube Data API)

Read the description through the official API and extract from it like a web page.

**Pros**: official, reliable from Vercel, cheap; fully groundable; small.
**Cons**: many Shorts have no recipe in the description, so the headline case often ends as "no written recipe"; ignores the creator page link, which is often the most exact source.

### Option 3: Text first ladder (chosen)

Creator page JSON-LD, then description, then (slice 2) a two pass transcript: Gemini writes out what is spoken and shown as text, then a separate extraction is grounded against that text.

**Pros**: every value traces to text; the most exact source goes first and is free; slice 1 ships without new evidence; slice 2 reaches spoken only Shorts.
**Cons**: the most moving parts; pass 1 is still model output; visual only recipes are dropped; up to 3 Gemini calls per paste.

### Option 4: Captions (scraped or a third party transcript API)

Pull YouTube's auto captions through the `timedtext` endpoint, a library, or a paid transcript service.

**Pros**: real speech text without a model pass; cheap per call.
**Cons**: scraping is often blocked from cloud IPs and breaks when YouTube changes; it's against YouTube's terms; a third party service adds a vendor, a key and a cost for a demo. 0001 already rejected this path.

## Rationale

The spike showed the risk sits in writing without a source, so the fix is to always hand the writing step a source it can be checked against. Option 3 does that at every step, and orders the steps by how exact and cheap they are: JSON-LD is structured and free, the description is official text, and the transcript comes last because it's the only step where the source text is itself model output.

Option 1 was rejected because a grounding failure looks like success, and a small spike can't prove the absence of a failure that's invisible. Option 2 is really slice 1 of Option 3 without the creator page. Taking the ladder means it can grow into spoken only Shorts without a redesign. Option 4 fails the Vercel reliability and terms concerns that 0001 already weighed.

Skateboard shapes the split: slice 1 is a complete, honest feature that needs no new evidence. Slice 2 waits for spike 2 because pass 1 hallucination can only be measured, not designed away. Dropping visual only reconstruction is deliberate: with nothing stated, any recipe would be invented, which is exactly what the scope forbids.

Smaller calls made in the design conversation, with the runner up for each:

- **Plain `fetch` + zod for the Data API** over `@googleapis/youtube`: one GET doesn't justify a Node only dependency.
- **Separate `YOUTUBE_API_KEY`** over reusing the Gemini key: least privilege, and it rotates on its own.
- **Drop oEmbed**: `videos.list` already returns the title and thumbnail, plus availability.
- **Link pick by deny list + first 2**, over Gemini naming the link: deterministic, no extra call.
- **Title word overlap** over trusting any JSON-LD: it catches a "related recipe" widget on a gear page.
- **Numbers grounded in steps**, over names and amounts only: the spike's invented cooking time was step text.
- **Dedup before reservation**: the shared library makes the first recipe the answer for everyone; no cost, no duplicates.
- **Slice 1 never returns `not_a_recipe`**: without watching, a bare description can't tell a spoken recipe Short from a travel vlog, so "no written recipe" is the honest message.
- **Always watch in slice 2 when text found nothing**, over stopping on a description `not_a_recipe`: descriptions are often empty, and video classification was 15/15.
- **Step budgets** (2 / 3 / 8 / 12 / 25 / 10 s + 10 s finish, 60 s worst case): fit 75 s; the creator page fetches run in parallel so two links cost one budget; spike 2 corrects pass 1.
- **Skip the description step under 100 characters** (URLs removed): saves a Gemini call on social link only descriptions.

Resolved after the cross check (2026-09-30), all on the recommended fix:

- **Grounding tightened**: timestamps, URLs and hashtags are stripped (chapter markers would otherwise ground any small number); whole token matching (so "oil" is not found in "boil"); quantity and unit must share a segment with the ingredient's head word (a stray "2" can't ground every amount).
- **An ungrounded step rejects the recipe** rather than being dropped: a recipe missing its bake step cooks wrong, which is worse than no recipe.
- **Provider schema carries no times or servings**, so there is no field that grounding can't check. Runner up: ground those fields too, at more code for fields the scope doesn't ask for.
- **Save and finish in one transaction**, so a crash can't leave a saved recipe with an unfinished attempt.
- **First writer wins** for a video, over a re-extract path: simpler, and #13 lets the owner fix it. Revisit if weak first extractions show up in practice.
- **Unavailable videos still cost quota**, over calling the Data API before reserving: keeps the AGENTS.md "reserve before any fetch" rule whole; 20 a day is plenty for a demo.
- **Thumbnail derived from the video ID**, over storing the API URL: one less stored API field under the YouTube data policy, and a fixed host.
- **Title word overlap stays at one shared word**, over requiring half the title: clickbait video titles share few words with the recipe name.

Slice 2 reworked on 2026-10-06, after slice 1 shipped and passed verify, before spike 2 ran. Each call with its runner up:

- **Spike before building stays the gate**, over building behind the switch and judging with `/check verify`: an invented word in a transcript looks exactly like a real one, so only a planned manual review over many runs can catch it, and a failure then costs a script, not built code.
- **10 minute cap, spike may only lower it**, over 20 minutes: a word for word transcript of 20 minutes is unlikely to fit 8192 output tokens or a 25 s budget, and the headline case is a Short. Runner up: 3 minutes (Shorts only), safest but drops most short recipe videos.
- **Same `GEMINI_MODEL` with its own pinned settings**, over a separate `GEMINI_VIDEO_MODEL`: one model and one env var to keep in sync; the spike's rerun path can still introduce a second model if evidence demands it.
- **`YOUTUBE_TRANSCRIPT=on` switch**, over reverting a commit: the step's risk (pass 1 is model output that grounding trusts) is exactly the kind of blast radius a switch is for; off restores slice 1 with an env change.
- **Pass 1 as plain text with three markers**, over a JSON response schema: cut off JSON can't be read at all, and plain text lets the cut off case be recognised cleanly from the finish reason and a small pure parser `check:extraction` can cover. Cost: the SDK no longer checks the shape.
- **A cut off transcript is not used**, over grounding against the part that arrived: grounding proves every saved value was stated, but it can't notice a missing final step, and a recipe without its bake step cooks wrong.
- **Spike set of 0001's five plus a spoken only Short and an 8 to 10 minute video**: keeps the comparison with spike 1 and adds the two cases slice 2 exists for (the headline Short and the cap).
- **Zero invented values across 21 runs per resolution**, over allowing one miss: a miss is a wrong recipe in the shared library that nobody can correct before an admin path exists (0003).
- **Compare low and default media resolution**: low uses roughly a quarter of the video tokens and runs faster, but may misread small on screen captions; only the spike can say which one passes.
- **On a fail, one rerun on a stronger model before deciding**, over shipping slice 1 as final straight away (the engineer's call): a grounding failure can be specific to one model, and one more run is cheap next to dropping the headline case.

Resolved after the slice 2 cross check (2026-10-06), all on the recommended fix:

- **`transcript_cut_off` outranks partial content**: the cut off is why the step that could have finished the recipe failed, so it's the more useful message.
- **Step 3 unreadable or blocked output ends `ingestion_failed`** when nothing more informative was seen, so `no_written_recipe` stays unreachable with the switch on.
- **Reuse `classifyGeminiResponse`** for blocked and empty answers; `RECITATION` is a real risk for word for word transcripts and maps to the existing `model_blocked`.
- **Thinking budget fixed at 0** for pass 1: thinking tokens count against the output limit and would fake cut offs.
- **Digits and one sentence per line in pass 1**: grounding matches number words only up to twelve, and unpunctuated speech has no sentence breaks; lines make the segments exact without a sentence splitter.
- **The prompt is a named constant written for the spike** and shipped unchanged, hashed in the evidence, so the spike measures the prompt that ships.
- **`FOOD: no` ends `not_a_recipe` directly**, over handing a talky non food video to pass 2: saves a call; spike 1 classified 15 of 15 runs right.
- **Headroom in the pass bar** (20 s, 8 s, half the token limit), so a pass does not mean production timeouts or regular cut offs.
- **Cost is informational**: the per user and app wide attempt limits already cap spend.

## Evidence: spike 2

Not run yet. Build plan task 11 records it here: run configuration, per video and per run outcomes, the manual grounding review per 0001's rules, and the verdict.
