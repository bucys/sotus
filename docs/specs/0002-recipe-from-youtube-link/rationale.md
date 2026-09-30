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

## Evidence: spike 2

Not run yet. Build plan task 11 records it here: run configuration, per video and per run outcomes, the manual grounding review per 0001's rules, and the verdict.
